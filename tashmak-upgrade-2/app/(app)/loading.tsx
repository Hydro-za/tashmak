export default function Loading() {
  return (<div aria-busy="true" aria-label="Loading">
    <div className="skel" style={{ height: 34, width: 220, marginBottom: 18 }} />
    <div className="stats">{[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 78 }} />)}</div>
    <div className="skel" style={{ height: 220, marginBottom: 14 }} /><div className="skel" style={{ height: 160 }} />
  </div>);
}
