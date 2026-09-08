"use client";

import { useState, useEffect, useCallback } from "react";

type TreeNode = {
  name: string;
  title?: string;
  page_index?: number;
  children?: TreeNode[];
  nodes?: TreeNode[];
};

function TreeNodeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const childrenList = node.children || node.nodes;
  const hasChildren = childrenList && childrenList.length > 0;

  return (
    <li>
      <div
        className="poc-pi-node"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <span
            className={`poc-pi-toggle${open ? " open" : ""}`}
            onClick={() => setOpen(!open)}
          >
            ▶
          </span>
        ) : (
          <span className="poc-pi-leaf-icon">•</span>
        )}
        <span>{node.name || node.title}</span>
      </div>
      {hasChildren && open && (
        <ul>
          {childrenList!.map((child) => (
            <TreeNodeItem key={child.name || child.title || child.page_index} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function countNodes(nodes: TreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count++;
    if (n.children) count += countNodes(n.children);
  }
  return count;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function PageIndexPanel() {
  const [expanded, setExpanded] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/poc/pageindex/tree`);
      if (!res.ok) throw new Error("Failed to fetch tree");
      const data = await res.json();
      setTree(data.tree || []);
    } catch {
      setTree([]);
    }
    setTreeLoading(false);
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  return (
    <section className="poc-pi-panel">
      <div className="poc-card-head" onClick={() => setExpanded(!expanded)}>
        <div className="poc-card-title">
          <span className={`poc-pi-arrow${expanded ? " open" : ""}`}>▶</span>
          {" "}PageIndex Knowledge Tree
        </div>
        <span className="badge badge-teal">
          {treeLoading ? "loading..." : `${countNodes(tree)} nodes`}
        </span>
      </div>

      {expanded && (
        <div className="poc-pi-body">
          {tree.length === 0 && !treeLoading && (
            <div className="poc-pi-empty">
              No tree data available. The backend will return a mock dental knowledge tree.
            </div>
          )}

          {tree.length > 0 && (
            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>Knowledge Structure</div>
              <ul className="poc-pi-tree">
                {tree.map((root) => (
                  <TreeNodeItem key={root.name || root.title || root.page_index} node={root} depth={0} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
