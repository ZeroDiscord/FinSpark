export default function CsvPreviewTable({ rows }) {
  if (!rows?.length) return null

  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/60">
      <table className="min-w-full text-left text-xs text-slate-300">
        <thead>
          <tr>
            {Object.keys(rows[0]).map((header) => (
              <th key={header} className="px-3 py-3 font-medium text-slate-500">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-white/5">
              {Object.values(row).map((value, valueIndex) => (
                <td key={valueIndex} className="px-3 py-3">
                  {String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
