import { useEffect, useState } from "react"

export default function Home() {
  const [tasks, setTasks] = useState<any[]>([])
  useEffect(() => {
    fetch("http://localhost:8000/api/v1/tasks")
      .then((r) => r.json())
      .then((data) => setTasks(data))
  }, [])
  return (
    <main className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Tasks</h1>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="border p-2 rounded">{t.title} - {t.status}</li>
        ))}
      </ul>
    </main>
  )
}
