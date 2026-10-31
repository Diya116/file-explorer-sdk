export default function ActivityPanel({ activity }) {
  return (
    <section className="panel">
      <h3>Activity</h3>
      {activity.length === 0 ? (
        <p className="muted">No changes yet.</p>
      ) : (
        <ul className="activity">
          {activity.map((a) => (
            <li key={a.id}>
              <span>{a.label}</span>
              <time>{new Date(a.timestamp).toLocaleTimeString()}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
