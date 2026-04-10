import { Link } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'

export function Dashboard() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          to="/listings/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <PlusCircle size={16} />
          New Listing
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Drafts', value: '0' },
          { label: 'Scheduled', value: '0' },
          { label: 'Published', value: '0' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Empty state */}
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-muted-foreground text-sm">No listings yet.</p>
        <Link
          to="/listings/new"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <PlusCircle size={16} />
          Create your first listing
        </Link>
      </div>
    </div>
  )
}
