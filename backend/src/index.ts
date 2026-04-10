import 'dotenv/config'
import app from './app'

const port = parseInt(process.env.PORT ?? '3001', 10)

app.listen(port, () => {
  console.log(`CardList API running on http://localhost:${port}`)
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`)
})
