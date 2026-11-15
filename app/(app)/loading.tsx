export default function Loading() {
  return (
    <div className="page-loading" aria-busy="true" aria-label="Loading page">
      <div className="page-loading-heading">
        <div className="skel" style={{ height: 28, width: 210 }} />
        <div className="skel" style={{ height: 14, width: 290, maxWidth: '70%' }} />
      </div>
      <div className="page-loading-stats">
        {[0, 1, 2, 3].map(i => <div key={i} className="skel page-loading-stat" />)}
      </div>
      <div className="page-loading-panel">
        <div className="skel" style={{ height: 20, width: 170, marginBottom: 8 }} />
        <div className="skel" style={{ height: 14, width: 250, maxWidth: '80%', marginBottom: 18 }} />
        <div className="page-loading-controls">
          <div className="skel" style={{ height: 38, width: 'min(360px, 100%)' }} />
          <div className="skel" style={{ height: 38, width: 120 }} />
        </div>
        <div className="page-loading-rows">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="page-loading-row"><div className="skel" /><div className="skel" /><div className="skel" /></div>)}
        </div>
      </div>
      <div className="page-loading-panel page-loading-secondary">
        <div className="skel" style={{ height: 18, width: 160, marginBottom: 14 }} />
        <div className="skel" style={{ height: 74, width: '100%' }} />
      </div>
    </div>
  );
}
