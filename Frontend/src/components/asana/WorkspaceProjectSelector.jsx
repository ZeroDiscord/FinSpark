export default function WorkspaceProjectSelector({
  label,
  value,
  items,
  onChange,
  placeholder,
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  )
}
