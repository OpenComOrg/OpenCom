function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let scaled = value;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  const digits = scaled >= 100 || unitIndex === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)} ${units[unitIndex]}`;
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value)) return "0 ms";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 2)} s`;
  if (value >= 100) return `${Math.round(value)} ms`;
  if (value >= 10) return `${value.toFixed(1)} ms`;
  return `${value.toFixed(2)} ms`;
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0%";
  return `${numeric.toFixed(numeric >= 10 ? 0 : 1)}%`;
}

function formatRatio(part, whole) {
  const partValue = Number(part || 0);
  const wholeValue = Number(whole || 0);
  if (!wholeValue || wholeValue <= 0) return "0%";
  return formatPercent((partValue / wholeValue) * 100);
}

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

function MetricCard({ label, value, detail, accent = false }) {
  return (
    <article className={`admin-kpi-card ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function UsageBar({ label, value, max, detail }) {
  const numericValue = Number(value || 0);
  const numericMax = Number(max || 0);
  const percent =
    numericMax > 0 ? Math.max(0, Math.min(100, (numericValue / numericMax) * 100)) : 0;

  return (
    <div className="admin-usage-bar">
      <div className="admin-usage-bar-head">
        <span>{label}</span>
        <strong>{detail}</strong>
      </div>
      <div className="admin-usage-bar-track">
        <div
          className="admin-usage-bar-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function RouteTable({ title, rows, emptyText }) {
  return (
    <article className="admin-card admin-dashboard-panel">
      <div className="admin-dashboard-panel-head">
        <h3>{title}</h3>
      </div>
      {rows.length ? (
        <div className="admin-users-table-wrap">
          <table className="admin-table admin-dashboard-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Requests</th>
                <th>Avg</th>
                <th>P95</th>
                <th>Max</th>
                <th>Error rate</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <div className="admin-route-cell">
                      <span className="admin-route-method">{row.method}</span>
                      <code>{row.route}</code>
                    </div>
                  </td>
                  <td>{formatNumber(row.count)}</td>
                  <td>{formatDuration(row.avgMs)}</td>
                  <td>{formatDuration(row.p95Ms)}</td>
                  <td>{formatDuration(row.maxMs)}</td>
                  <td>{formatPercent(row.errorRate)}</td>
                  <td>{formatDateTime(row.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-dim">{emptyText}</p>
      )}
    </article>
  );
}

function DatabaseStatList({ stats }) {
  const entries = [
    ["Users", stats.users],
    ["Banned users", stats.bannedUsers],
    ["Active sessions", stats.activeRefreshSessions],
    ["All refresh sessions", stats.refreshSessions],
    ["Servers", stats.servers],
    ["Server memberships", stats.memberships],
    ["Active invites", stats.activeInvites],
    ["Friend links", stats.friendships],
    ["DM threads", stats.socialDmThreads],
    ["DM messages", stats.socialDmMessages],
    ["DM attachments", stats.socialDmAttachments],
    ["Platform admins", stats.platformAdmins],
    ["Staff assignments", stats.staffAssignments],
    ["Published blogs", stats.publishedBlogs],
    ["Draft blogs", stats.draftBlogs],
    ["Badge definitions", stats.badgeDefinitions],
    ["Active boost grants", stats.boostGrantsActive],
    ["Boost badge members", stats.boostBadgeMembers],
    ["Boost Stripe members", stats.boostStripeMembers],
    ["Support tickets (open)", stats.supportTicketsOpen],
    ["Support tickets (total)", stats.supportTicketsTotal],
  ];

  return (
    <div className="admin-stat-list">
      {entries.map(([label, value]) => (
        <div key={label} className="admin-stat-list-row">
          <span>{label}</span>
          <strong>{formatNumber(value)}</strong>
        </div>
      ))}
    </div>
  );
}

export function AdminOverviewDashboard({
  adminOverview,
  stats,
  loading,
  onRefresh,
}) {
  const admins = Array.isArray(adminOverview?.admins) ? adminOverview.admins : [];
  const storageRoots = Array.isArray(stats?.storage?.roots) ? stats.storage.roots : [];
  const requests = stats?.requests || null;
  const service = stats?.service || null;
  const memory = service?.memory || null;
  const topStorageRoot = storageRoots[0] || null;
  const boostBadgeMembers =
    Number(stats?.database?.boostBadgeMembers || adminOverview?.boostBadgeMembers || 0);
  const boostStripeMembers =
    Number(stats?.database?.boostStripeMembers || adminOverview?.boostStripeMembers || 0);
  const boostGrantMembers =
    Number(stats?.database?.boostGrantsActive || adminOverview?.activeBoostGrants || 0);

  return (
    <section className="admin-section admin-dashboard">
      <div className="admin-dashboard-topline">
        <div>
          <p className="admin-eyebrow">Default view</p>
          <h2>Stats dashboard</h2>
          <p className="admin-hint">
            Review live request timing, runtime pressure, tracked storage, and
            platform footprint in one place.
          </p>
        </div>
        <div className="admin-dashboard-actions">
          <div className="admin-refresh-meta">
            <span>Last snapshot</span>
            <strong>{formatDateTime(stats?.generatedAt)}</strong>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh dashboard"}
          </button>
        </div>
      </div>

      <div className="admin-kpi-strip">
        <MetricCard
          label="Requests served"
          value={formatNumber(requests?.totalCount)}
          detail={`P95 ${formatDuration(requests?.p95Ms)}`}
          accent
        />
        <MetricCard
          label="Average response"
          value={formatDuration(requests?.avgMs)}
          detail={`${formatNumber(requests?.inFlight)} in flight`}
        />
        <MetricCard
          label="Tracked storage"
          value={formatBytes(stats?.storage?.totalTrackedBytes)}
          detail={topStorageRoot ? `${topStorageRoot.label} leads` : "No tracked roots yet"}
        />
        <MetricCard
          label="Process memory"
          value={formatBytes(memory?.rssBytes)}
          detail={`Heap ${formatBytes(memory?.heapUsedBytes)}`}
        />
        <MetricCard
          label="Platform users"
          value={formatNumber(stats?.database?.users)}
          detail={`${formatNumber(stats?.database?.activeRefreshSessions)} active sessions`}
        />
        <MetricCard
          label="Boost members"
          value={formatNumber(boostBadgeMembers)}
          detail={`${formatRatio(boostBadgeMembers, stats?.database?.users)} of users · Stripe ${formatNumber(boostStripeMembers)} · Manual ${formatNumber(boostGrantMembers)}`}
          accent
        />
        <MetricCard
          label="Service uptime"
          value={formatUptime(service?.uptimeSec)}
          detail={service ? `${service.nodeVersion} on ${service.hostname}` : "Waiting for stats"}
        />
      </div>

      <div className="admin-dashboard-grid">
        <article className="admin-card admin-dashboard-panel admin-dashboard-panel-wide">
          <div className="admin-dashboard-panel-head">
            <h3>Control plane snapshot</h3>
            <small>People and content with elevated platform access.</small>
          </div>
          <div className="admin-cards admin-cards-compact">
            <div className="admin-card admin-card-plain">
              <h3>Founder</h3>
              {adminOverview?.founder?.id ? (
                <p>
                  <strong>{adminOverview.founder.username || "Unknown"}</strong>
                  <br />
                  <code>{adminOverview.founder.id}</code>
                </p>
              ) : (
                <p className="text-dim">No founder is currently assigned.</p>
              )}
            </div>
            <div className="admin-card admin-card-plain">
              <h3>Platform admins</h3>
              <p>
                <strong>{formatNumber(admins.length)}</strong> admin account(s)
              </p>
              {admins.length ? (
                <div className="admin-pill-cloud">
                  {admins.slice(0, 6).map((admin) => (
                    <span key={admin.id} className="admin-pill-chip">
                      {admin.username}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="admin-card admin-card-plain">
              <h3>Manual boosts</h3>
              <p>
                <strong>{formatNumber(adminOverview?.activeBoostGrants)}</strong>{" "}
                active grant(s)
              </p>
              <p className="text-dim">
                {formatNumber(boostBadgeMembers)} users currently carry boost.
              </p>
            </div>
            <div className="admin-card admin-card-plain">
              <h3>Panel staff</h3>
              <p>
                <strong>{formatNumber(adminOverview?.staffAssignmentsCount)}</strong>{" "}
                assignment(s)
              </p>
            </div>
            <div className="admin-card admin-card-plain">
              <h3>Published blogs</h3>
              <p>
                <strong>{formatNumber(adminOverview?.publishedBlogsCount)}</strong>{" "}
                live post(s)
              </p>
            </div>
            <div className="admin-card admin-card-plain">
              <h3>Support queue</h3>
              <p>
                <strong>{formatNumber(stats?.database?.supportTicketsOpen || adminOverview?.supportTicketsOpen)}</strong>{" "}
                open ticket(s)
              </p>
              <p className="text-dim">
                Total tickets: {formatNumber(stats?.database?.supportTicketsTotal || adminOverview?.supportTicketsTotal)}
              </p>
            </div>
          </div>
        </article>

        <article className="admin-card admin-dashboard-panel">
          <div className="admin-dashboard-panel-head">
            <h3>Runtime pressure</h3>
            <small>Live process and host memory view.</small>
          </div>
          <div className="admin-runtime-grid">
            <MetricCard
              label="PID"
              value={service?.pid || "—"}
              detail={`${service?.platform || "—"} / ${service?.arch || "—"}`}
            />
            <MetricCard
              label="CPU cores"
              value={formatNumber(service?.cpuCount)}
              detail={`Load ${Array.isArray(service?.loadAverage) ? service.loadAverage.join(" / ") : "—"}`}
            />
          </div>
          <div className="admin-usage-stack">
            <UsageBar
              label="Process RSS"
              value={memory?.rssBytes}
              max={memory?.systemTotalBytes}
              detail={`${formatBytes(memory?.rssBytes)} of ${formatBytes(memory?.systemTotalBytes)}`}
            />
            <UsageBar
              label="Heap used"
              value={memory?.heapUsedBytes}
              max={memory?.heapTotalBytes}
              detail={`${formatBytes(memory?.heapUsedBytes)} of ${formatBytes(memory?.heapTotalBytes)}`}
            />
            <UsageBar
              label="System memory"
              value={memory?.systemUsedBytes}
              max={memory?.systemTotalBytes}
              detail={`${formatBytes(memory?.systemUsedBytes)} of ${formatBytes(memory?.systemTotalBytes)}`}
            />
          </div>
        </article>

        <article className="admin-card admin-dashboard-panel">
          <div className="admin-dashboard-panel-head">
            <h3>Request mix</h3>
            <small>Traffic quality since this core process started.</small>
          </div>
          <div className="admin-request-mix">
            <MetricCard
              label="Successful"
              value={formatNumber(requests?.statusCounts?.success)}
              detail="2xx responses"
            />
            <MetricCard
              label="Redirects"
              value={formatNumber(requests?.statusCounts?.redirect)}
              detail="3xx responses"
            />
            <MetricCard
              label="Client errors"
              value={formatNumber(requests?.statusCounts?.clientError)}
              detail="4xx responses"
            />
            <MetricCard
              label="Server errors"
              value={formatNumber(requests?.statusCounts?.serverError)}
              detail="5xx responses"
            />
          </div>
          <p className="admin-note">
            Route latency numbers are measured in-memory from this service
            start, so restarting core resets the window.
          </p>
        </article>

        <article className="admin-card admin-dashboard-panel admin-dashboard-panel-wide">
          <div className="admin-dashboard-panel-head">
            <h3>Tracked storage</h3>
            <small>Which platform directories are taking the space.</small>
          </div>
          {storageRoots.length ? (
            <div className="admin-storage-list">
              {storageRoots.map((root) => (
                <div key={root.id} className="admin-storage-item">
                  <div className="admin-storage-item-head">
                    <strong>{root.label}</strong>
                    <span>{formatBytes(root.bytes)}</span>
                  </div>
                  <div className="admin-storage-item-meta">
                    <code>{root.path}</code>
                    <span>
                      {formatNumber(root.fileCount)} files,{" "}
                      {formatNumber(root.directoryCount)} folders
                    </span>
                  </div>
                  <div className="admin-storage-item-meta">
                    <span>{root.exists ? "Available" : "Missing"}</span>
                    {root.diskTotalBytes ? (
                      <span>
                        Disk free {formatBytes(root.diskFreeBytes)} /{" "}
                        {formatBytes(root.diskTotalBytes)}
                      </span>
                    ) : (
                      <span>Disk stats unavailable</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dim">No storage roots are being tracked yet.</p>
          )}
        </article>

        <article className="admin-card admin-dashboard-panel">
          <div className="admin-dashboard-panel-head">
            <h3>Database footprint</h3>
            <small>Core-side entity counts.</small>
          </div>
          <DatabaseStatList stats={stats?.database || {}} />
        </article>

        <RouteTable
          title="Slowest endpoints"
          rows={Array.isArray(requests?.slowestRoutes) ? requests.slowestRoutes : []}
          emptyText="No request timing has been collected yet."
        />

        <RouteTable
          title="Busiest endpoints"
          rows={Array.isArray(requests?.busiestRoutes) ? requests.busiestRoutes : []}
          emptyText="Traffic volume will appear after the service handles requests."
        />
      </div>
    </section>
  );
}
