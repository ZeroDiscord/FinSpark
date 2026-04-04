export const REQUIRED_CSV_COLUMNS = [
  'tenant_id',
  'session_id',
  'user_id',
  'timestamp',
  'deployment_type',
  'channel',
  'l1_domain',
  'l2_module',
  'l3_feature',
  'l4_action',
  'l5_deployment_node',
  'duration_ms',
  'success',
  'metadata',
  'feedback_text',
  'churn_label',
]

export function parseCsvText(text, previewCount = 5) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return { headers: [], rows: [], missingColumns: REQUIRED_CSV_COLUMNS }

  const headers = lines[0].split(',').map((item) => item.trim())
  const rows = lines.slice(1, previewCount + 1).map((line) => {
    const values = line.split(',').map((item) => item.trim())
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? ''
      return acc
    }, {})
  })
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((column) => !headers.includes(column))
  return { headers, rows, missingColumns }
}

export async function parseCsvFile(file, previewCount = 5) {
  return parseCsvText(await file.text(), previewCount)
}
