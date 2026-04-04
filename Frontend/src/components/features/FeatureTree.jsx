import { ChevronDown, ChevronRight } from 'lucide-react'

function renderNode(node, expandedNodes, onToggle, selectedId, onSelect, level = 0) {
  const expanded = expandedNodes.includes(node.id)
  const hasChildren = node.children?.length

  return (
    <div key={node.id} className="space-y-2">
      <button
        onClick={() => {
          if (hasChildren) onToggle(node.id)
          onSelect(node)
        }}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm ${
          selectedId === node.id ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
        }`}
        style={{ paddingLeft: `${12 + level * 18}px` }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        ) : (
          <span className="h-4 w-4" />
        )}
        <span>{node.name}</span>
      </button>
      {expanded && hasChildren ? (
        <div className="space-y-2">
          {node.children.map((child) =>
            renderNode(child, expandedNodes, onToggle, selectedId, onSelect, level + 1),
          )}
        </div>
      ) : null}
    </div>
  )
}

export default function FeatureTree({ nodes, expandedNodes, onToggle, selectedId, onSelect }) {
  return <div className="space-y-2">{nodes.map((node) => renderNode(node, expandedNodes, onToggle, selectedId, onSelect))}</div>
}
