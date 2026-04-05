import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function SortableCard({ id, children, className = '' }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
  }

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {/* Drag handle injected as data attribute for children to use */}
      <div
        {...attributes}
        {...listeners}
        data-drag-handle="true"
        className="absolute left-0 top-0 z-10 flex h-10 w-6 cursor-grab items-center justify-center opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
        style={{ touchAction: 'none' }}
      >
        <svg className="h-4 w-4 text-slate-500" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.2" />
          <circle cx="11" cy="4" r="1.2" />
          <circle cx="5" cy="8" r="1.2" />
          <circle cx="11" cy="8" r="1.2" />
          <circle cx="5" cy="12" r="1.2" />
          <circle cx="11" cy="12" r="1.2" />
        </svg>
      </div>
      {children}
    </div>
  )
}
