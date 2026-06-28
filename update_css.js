const fs=require('fs');
let t=fs.readFileSync('src/styles/global.css','utf8');
const start = t.indexOf('.approval-card-grid {');
const end = t.indexOf('.approval-link {');
if(start !== -1 && end !== -1) {
  const replacement = \
.approval-list-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.approval-list-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  box-shadow: var(--shadow-sm);
  padding: 1rem;
  gap: 1rem;
}

@media (min-width: 768px) {
  .approval-list-card {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.approval-info-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
}

.approval-hierarchy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text1);
}

.approval-subject {
  color: var(--primary);
  font-weight: 800;
}

.approval-unit, .approval-topic {
  color: var(--text2);
}

.approval-divider {
  color: var(--line);
  font-size: 0.8rem;
}

.approval-submitter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: var(--text3);
}

.approval-url-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--text3);
  background: var(--surface);
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--line);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.approval-url-text {
  color: var(--text2);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
}
.approval-url-text:hover {
  text-decoration: underline;
  color: var(--primary);
}

.approval-actions-col {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.approval-stats-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
.stat-card {
  flex: 1;
  min-width: 120px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}
.stat-value {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
  margin-bottom: 0.25rem;
}
.stat-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

\;
  t = t.substring(0, start) + replacement + t.substring(end);
  fs.writeFileSync('src/styles/global.css', t);
  console.log('Replaced global.css');
} else {
  console.log('Not found in global.css', start, end);
}
