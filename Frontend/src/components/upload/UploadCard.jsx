import { Card, CardContent } from '../ui/Card.jsx'

export default function UploadCard({ title, description, children, status }) {
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">{description}</p>
          </div>
          {status}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
