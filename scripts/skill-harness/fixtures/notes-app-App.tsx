import { useState } from "react";

type Note = { id: string; title: string; body: string };

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <main>
      <h1>Notes</h1>
      <form onSubmit={(e) => { e.preventDefault(); setNotes([...notes, { id: String(Date.now()), title, body }]); setTitle(""); setBody(""); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" />
        <button type="submit">Add</button>
      </form>
      <ul>{notes.map((n) => <li key={n.id}><strong>{n.title}</strong><p>{n.body}</p></li>)}</ul>
    </main>
  );
}
