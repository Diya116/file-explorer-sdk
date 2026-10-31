import TreeNode from './TreeNode'

export default function FileTree({ tree, ui }) {
  return (
    <ul className="tree" role="tree">
      <TreeNode
        node={tree}
        depth={0}
        expanded={ui.expanded}
        selectedId={ui.selectedId}
        checked={ui.checked}
        onToggle={ui.toggleExpanded}
        onSelect={ui.select}
        onCheck={ui.toggleChecked}
      />
    </ul>
  )
}
