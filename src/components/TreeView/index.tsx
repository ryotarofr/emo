import {
	TreeView as ArkTreeView,
	createTreeCollection,
} from "@ark-ui/solid/tree-view";
import {
	ChevronRightIcon,
	FileIcon,
	FolderIcon,
	FolderOpenIcon,
} from "lucide-solid";
import { createSignal, For } from "solid-js";
import styles from "./index.module.css";

export const TreeView = () => {
	const [expandedValue, setExpandedValue] = createSignal<string[]>([
		"node_modules",
	]);

	return (
		<ArkTreeView.Root
			class={styles.Root}
			collection={collection}
			expandedValue={expandedValue()}
			onExpandedChange={({ expandedValue }) => setExpandedValue(expandedValue)}
		>
			<ArkTreeView.Label class={styles.Label}>Tree</ArkTreeView.Label>
			<ArkTreeView.Tree class={styles.Tree}>
				<For each={collection.rootNode.children}>
					{(node, index) => <TreeNode node={node} indexPath={[index()]} />}
				</For>
			</ArkTreeView.Tree>
		</ArkTreeView.Root>
	);
};

const TreeNode = (props: ArkTreeView.NodeProviderProps<Node>) => {
	return (
		<ArkTreeView.NodeProvider node={props.node} indexPath={props.indexPath}>
			<ArkTreeView.NodeContext>
				{(nodeState) =>
					props.node.children ? (
						<ArkTreeView.Branch class={styles.Branch}>
							<ArkTreeView.BranchControl class={styles.BranchControl}>
								<ArkTreeView.BranchIndicator class={styles.BranchIndicator}>
									<ChevronRightIcon />
								</ArkTreeView.BranchIndicator>
								<ArkTreeView.BranchText class={styles.BranchText}>
									{nodeState().expanded ? <FolderOpenIcon /> : <FolderIcon />}
									{props.node.name}
								</ArkTreeView.BranchText>
							</ArkTreeView.BranchControl>
							<ArkTreeView.BranchContent class={styles.BranchContent}>
								<ArkTreeView.BranchIndentGuide
									class={styles.BranchIndentGuide}
								/>
								<For each={props.node.children}>
									{(child, index) => (
										<TreeNode
											node={child}
											indexPath={[...props.indexPath, index()]}
										/>
									)}
								</For>
							</ArkTreeView.BranchContent>
						</ArkTreeView.Branch>
					) : (
						<ArkTreeView.Item class={styles.Item}>
							<ArkTreeView.ItemText class={styles.ItemText}>
								<FileIcon />
								{props.node.name}
							</ArkTreeView.ItemText>
						</ArkTreeView.Item>
					)
				}
			</ArkTreeView.NodeContext>
		</ArkTreeView.NodeProvider>
	);
};

interface Node {
	id: string;
	name: string;
	children?: Node[];
}

const collection = createTreeCollection<Node>({
	nodeToValue: (node) => node.id,
	nodeToString: (node) => node.name,
	rootNode: {
		id: "ROOT",
		name: "",
		children: [
			{
				id: "node_modules",
				name: "node_modules",
				children: [
					{ id: "node_modules/zag-js", name: "zag-js" },
					{ id: "node_modules/pandacss", name: "panda" },
					{
						id: "node_modules/@types",
						name: "@types",
						children: [
							{ id: "node_modules/@types/react", name: "react" },
							{ id: "node_modules/@types/react-dom", name: "react-dom" },
						],
					},
				],
			},
			{
				id: "src",
				name: "src",
				children: [
					{ id: "src/app.tsx", name: "app.tsx" },
					{ id: "src/index.ts", name: "index.ts" },
				],
			},
			{ id: "panda.config", name: "panda.config.ts" },
			{ id: "package.json", name: "package.json" },
			{ id: "renovate.json", name: "renovate.json" },
			{ id: "readme.md", name: "README.md" },
		],
	},
});
