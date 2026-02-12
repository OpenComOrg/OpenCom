import { useState } from "react";

export function ChannelSidebar({
  guildName,
  channels = [],
  roles = [],
  myRoleIds = [],
  activeChannelId,
  onChannelSelect,
  onCreateChannel
}) {
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  // Organize channels by category
  const categories = channels.filter(c => c.type === "category");
  const uncategorizedChannels = channels.filter(c => c.type !== "category" && !c.parent_id);

  const getChannelsByCategory = (categoryId) => {
    return channels.filter(c => c.parent_id === categoryId).sort((a, b) => a.position - b.position);
  };

  const toggleCategory = (catId) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setExpandedCategories(newSet);
  };

  const getChannelIcon = (type) => {
    switch (type) {
      case "voice": return "🔊";
      case "text": return "#";
      case "category": return "📁";
      default: return "•";
    }
  };

  return (
    <div className="channel-sidebar">
      <div className="sidebar-header">
        <h2>{guildName}</h2>
      </div>

      <div className="channels-container">
        {/* Uncategorized channels */}
        {uncategorizedChannels.length > 0 && (
          <div className="sidebar-block">
            {uncategorizedChannels.map(channel => (
              <button
                key={channel.id}
                className={`channel-btn ${activeChannelId === channel.id ? 'active' : ''}`}
                onClick={() => onChannelSelect(channel.id)}
              >
                <span>{getChannelIcon(channel.type)}</span>
                {channel.name}
              </button>
            ))}
          </div>
        )}

        {/* Categorized channels */}
        {categories.map(category => {
          const chansInCat = getChannelsByCategory(category.id);
          const isExpanded = expandedCategories.has(category.id);

          return (
            <div key={category.id} className="sidebar-block">
              <button
                className="category-header"
                onClick={() => toggleCategory(category.id)}
              >
                {isExpanded ? "▼" : "▶"} {category.name}
              </button>
              {isExpanded && chansInCat.map(channel => (
                <button
                  key={channel.id}
                  className={`channel-btn ${activeChannelId === channel.id ? 'active' : ''}`}
                  onClick={() => onChannelSelect(channel.id)}
                >
                  <span>{getChannelIcon(channel.type)}</span>
                  {channel.name}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer" style={{ padding: "12px", borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={() => onCreateChannel?.("text")} style={{ width: "100%" }}>
          + Add Channel
        </button>
      </div>
    </div>
  );
}
