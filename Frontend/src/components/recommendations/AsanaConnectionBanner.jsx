import { Link } from 'react-router-dom'
import Button from '../ui/Button.jsx'
import { Card, CardContent } from '../ui/Card.jsx'

export default function AsanaConnectionBanner() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Connect Asana to activate Kanban actions</h3>
          <p className="text-sm text-slate-400">
            Sync recommendations directly into your delivery backlog and assign them to teams.
          </p>
        </div>
        <Link to="/app/asana">
          <Button>Connect Asana</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
