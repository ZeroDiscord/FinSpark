import { AnimatePresence, motion } from 'framer-motion'
import { FileSpreadsheet, TableProperties, UploadCloud, X } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { REQUIRED_CSV_COLUMNS } from '../../utils/csvSchema.js'
import Button from '../ui/Button.jsx'

export default function CsvDropzone({
  file,
  previewRows,
  requiredColumns = REQUIRED_CSV_COLUMNS,
  onFileSelect,
  onRemove,
  disabled,
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'], 'application/csv': ['.csv'] },
    maxFiles: 1,
    disabled,
    onDrop: (files) => files[0] && onFileSelect(files[0]),
  })

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`rounded-[28px] border border-dashed px-6 py-10 text-center transition ${
          isDragActive
            ? 'border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.3)]'
            : 'border-white/15 bg-white/[0.03]'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto mb-4 h-10 w-10 text-cyan-300" />
        <div className="space-y-2">
          <h4 className="text-lg font-medium text-white">Upload usage dataset CSV</h4>
          <p className="text-sm text-slate-400">
            Required columns: {requiredColumns.join(', ')}
          </p>
        </div>
      </div>
      <AnimatePresence>
        {file ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/70 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-200">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{file.name}</div>
                  <div className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(0)} KB
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {previewRows?.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <TableProperties className="h-4 w-4 text-cyan-300" />
                  Previewing first {previewRows.length} rows
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs text-slate-300">
                    <thead>
                      <tr>
                        {Object.keys(previewRows[0]).map((header) => (
                          <th key={header} className="px-2 py-2 text-slate-500">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={index} className="border-t border-white/5">
                          {Object.values(row).map((value, valueIndex) => (
                            <td key={valueIndex} className="px-2 py-2">
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
