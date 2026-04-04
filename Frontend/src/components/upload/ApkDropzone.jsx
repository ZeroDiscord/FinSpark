import { AnimatePresence, motion } from 'framer-motion'
import { FileArchive, UploadCloud, X } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import Button from '../ui/Button.jsx'

export default function ApkDropzone({ file, progress, onFileSelect, onRemove, disabled }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/vnd.android.package-archive': ['.apk'] },
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
          <h4 className="text-lg font-medium text-white">Drop your Android APK here</h4>
          <p className="text-sm text-slate-400">
            We will parse app screens, infer feature hierarchy, and prepare tracking output.
          </p>
        </div>
      </div>
      <AnimatePresence>
        {file ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-3xl border border-white/10 bg-slate-950/70 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-indigo-200">
                  <FileArchive className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{file.name}</div>
                  <div className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/5">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
