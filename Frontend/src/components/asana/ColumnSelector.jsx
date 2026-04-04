export default function ColumnSelector({ value, onChange, items = [] }) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-slate-400">Kanban column</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
      >
        <option value="">Select section</option>
        {items.map((column) => (
          <option key={column.id} value={column.id}>
            {column.name}
          </option>
        ))}
      </select>
    </label>
  )
}
