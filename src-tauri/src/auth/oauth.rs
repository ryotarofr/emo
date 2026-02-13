use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use url::Url;

use super::OAuthProviderConfig;
use crate::error::AppError;

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Debug)]
pub struct OAuthUserInfo {
    pub provider_user_id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub username: String,
}

fn generate_pkce() -> (String, String) {
    let verifier = format!(
        "{}{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn generate_state() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn build_auth_url(
    config: &OAuthProviderConfig,
    redirect_uri: &str,
    state: &str,
    pkce_challenge: Option<&str>,
) -> Result<String, AppError> {
    let mut url = Url::parse(&config.auth_url).map_err(|e| AppError::Internal(e.to_string()))?;
    {
        let mut params = url.query_pairs_mut();
        params.append_pair("client_id", &config.client_id);
        params.append_pair("redirect_uri", redirect_uri);
        params.append_pair("response_type", "code");
        params.append_pair("state", state);
        params.append_pair("scope", &config.scopes.join(" "));
        if let Some(challenge) = pkce_challenge {
            params.append_pair("code_challenge", challenge);
            params.append_pair("code_challenge_method", "S256");
        }
    }
    Ok(url.to_string())
}

fn wait_for_callback(
    server: tiny_http::Server,
    timeout: Duration,
) -> Result<(String, String), AppError> {
    match server.recv_timeout(timeout) {
        Ok(Some(request)) => {
            let url_str = format!("http://127.0.0.1{}", request.url());
            let parsed = Url::parse(&url_str)
                .map_err(|e| AppError::Internal(format!("URL parse error: {e}")))?;

            let code = parsed
                .query_pairs()
                .find(|(k, _)| k == "code")
                .map(|(_, v)| v.to_string())
                .ok_or_else(|| {
                    let error = parsed
                        .query_pairs()
                        .find(|(k, _)| k == "error")
                        .map(|(_, v)| v.to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    AppError::AuthFailed(format!("OAuth error: {error}"))
                })?;

            let state = parsed
                .query_pairs()
                .find(|(k, _)| k == "state")
                .map(|(_, v)| v.to_string())
                .ok_or_else(|| AppError::AuthFailed("Missing state parameter".to_string()))?;

            let html = "<html><head><meta charset='utf-8'></head>\
                <body style='text-align:center;padding:50px;font-family:sans-serif'>\
                <h1>Authentication Successful</h1>\
                <p>You can close this window and return to the app.</p>\
                </body></html>";
            let response = tiny_http::Response::from_string(html).with_header(
                tiny_http::Header::from_bytes(b"Content-Type", b"text/html; charset=utf-8")
                    .unwrap(),
            );
            let _ = request.respond(response);

            Ok((code, state))
        }
        Ok(None) => Err(AppError::AuthTimeout),
        Err(e) => Err(AppError::Internal(format!("Callback server error: {e}"))),
    }
}

async fn exchange_code(
    config: &OAuthProviderConfig,
    code: &str,
    redirect_uri: &str,
    pkce_verifier: Option<&str>,
) -> Result<TokenResponse, AppError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut params = vec![
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
    ];
    if let Some(verifier) = pkce_verifier {
        params.push(("code_verifier", verifier));
    }

    let mut request = client.post(&config.token_url).form(&params);
    if config.name == "github" {
        request = request.header("Accept", "application/json");
    }

    let response = request
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Token exchange failed: {e}")))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::AuthFailed(format!(
            "Token exchange failed: {body}"
        )));
    }

    response
        .json::<TokenResponse>()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to parse token response: {e}")))
}

async fn get_google_user_info(access_token: &str) -> Result<OAuthUserInfo, AppError> {
    #[derive(Deserialize)]
    struct GoogleUser {
        sub: String,
        email: Option<String>,
        name: Option<String>,
        picture: Option<String>,
    }

    let client = reqwest::Client::new();
    let user: GoogleUser = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(OAuthUserInfo {
        username: user
            .email
            .clone()
            .unwrap_or_else(|| format!("google_{}", &user.sub[..8.min(user.sub.len())])),
        provider_user_id: user.sub,
        email: user.email,
        display_name: user.name,
        avatar_url: user.picture,
    })
}

async fn get_github_user_info(access_token: &str) -> Result<OAuthUserInfo, AppError> {
    #[derive(Deserialize)]
    struct GitHubUser {
        id: i64,
        login: String,
        name: Option<String>,
        email: Option<String>,
        avatar_url: Option<String>,
    }

    #[derive(Deserialize)]
    struct GitHubEmail {
        email: String,
        primary: bool,
        verified: bool,
    }

    let client = reqwest::Client::new();

    let user: GitHubUser = client
        .get("https://api.github.com/user")
        .bearer_auth(access_token)
        .header("User-Agent", "tebiki")
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let email = if user.email.is_some() {
        user.email.clone()
    } else {
        let emails: Vec<GitHubEmail> = match client
            .get("https://api.github.com/user/emails")
            .bearer_auth(access_token)
            .header("User-Agent", "tebiki")
            .send()
            .await
        {
            Ok(resp) => resp.json().await.unwrap_or_default(),
            Err(_) => vec![],
        };

        emails
            .into_iter()
            .find(|e| e.primary && e.verified)
            .map(|e| e.email)
    };

    Ok(OAuthUserInfo {
        provider_user_id: user.id.to_string(),
        username: user.login,
        email,
        display_name: user.name,
        avatar_url: user.avatar_url,
    })
}

pub async fn start_oauth_flow(provider_name: &str) -> Result<OAuthUserInfo, AppError> {
    let config = OAuthProviderConfig::from_name(provider_name)?;

    let (pkce_verifier, pkce_challenge) = if config.use_pkce {
        let (v, c) = generate_pkce();
        (Some(v), Some(c))
    } else {
        (None, None)
    };

    let state = generate_state();

    // Start local callback server on a random port
    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| AppError::Internal(format!("Failed to start callback server: {e}")))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| AppError::Internal("Failed to get server port".to_string()))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let auth_url = build_auth_url(&config, &redirect_uri, &state, pkce_challenge.as_deref())?;

    // Open system browser
    open::that_detached(&auth_url)
        .map_err(|e| AppError::Internal(format!("Failed to open browser: {e}")))?;

    // Wait for callback (up to 5 minutes) in a blocking thread
    let expected_state = state;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = wait_for_callback(server, Duration::from_secs(300));
        let _ = tx.send(result);
    });
    let (code, returned_state) = rx
        .recv()
        .map_err(|_| AppError::Internal("Callback channel closed".to_string()))??;

    if returned_state != expected_state {
        return Err(AppError::AuthFailed(
            "State mismatch - possible CSRF attack".to_string(),
        ));
    }

    // Exchange code for tokens
    let tokens = exchange_code(&config, &code, &redirect_uri, pkce_verifier.as_deref()).await?;

    // Get user info from provider
    match provider_name {
        "google" => get_google_user_info(&tokens.access_token).await,
        "github" => get_github_user_info(&tokens.access_token).await,
        _ => Err(AppError::ProviderNotConfigured(provider_name.to_string())),
    }
}
