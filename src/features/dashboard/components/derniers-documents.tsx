import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { EmptyState } from '@/components/common/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMime } from '@/features/documents/format'
import { formatDate } from '@/lib/date'
import { dashboardQueries } from '../queries'

interface DerniersDocumentsProps {
  siteId: string
}

/** Cinq derniers documents ajoutés au site. */
export function DerniersDocuments({ siteId }: DerniersDocumentsProps) {
  const query = useQuery(dashboardQueries.derniersDocuments(siteId))

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Derniers documents</CardTitle>
        <CardDescription>Derniers fichiers ajoutés au site.</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          query={query}
          pending={
            <CardSkeletons count={4} height="h-10" container="space-y-2" />
          }
          errorClassName="py-6"
          empty={
            <EmptyState
              icon={FileText}
              title="Aucun document"
              description="Aucun fichier n'a encore été ajouté à ce site."
              className="py-6"
            />
          }
        >
          {(data) => (
            <ul className="divide-y">
              {data.map((doc) => (
                <li key={doc.id}>
                  <Link
                    to="/documents"
                    className="hover:bg-accent -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {doc.nom_original}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatDate(doc.uploaded_at)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {formatMime(doc.mime_type)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
    </Card>
  )
}
