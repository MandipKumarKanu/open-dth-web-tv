import { LayoutGrid, History, Star, Tv, Search, Languages } from "lucide-react";

export default function Loading() {
  return (
    <div className="home-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-badge">
            <Tv size={16} color="#fff" />
          </div>
          <span className="sidebar-brand-title">Live TV</span>
        </div>
        <button type="button" className="search-tile">
          <Search size={18} color="#38bdf8" />
          <span style={{ flex: 1, textAlign: "left", color: "#fff" }}>Search</span>
        </button>
        <div style={{ height: 10 }} />
        <div className="sidebar-scroll">
          {["Home", "Favorites", "News", "Entertainment", "Sports", "Kids"].map(
            (label) => (
              <div
                key={label}
                className="side-item"
                style={{ pointerEvents: "none" }}
              >
                <span className="si-icon">
                  {label === "Home" && <LayoutGrid size={18} />}
                  {label === "Favorites" && <Star size={18} color="#ffd700" />}
                  {label === "Recent" && <History size={18} />}
                  {label === "News" && <Search size={18} />}
                  {label === "Entertainment" && <Tv size={18} />}
                  {label === "Sports" && <Star size={18} />}
                  {label === "Kids" && <History size={18} />}
                  {label !== "Home" &&
                    label !== "Favorites" &&
                    label !== "Recent" &&
                    label !== "News" &&
                    label !== "Entertainment" &&
                    label !== "Sports" &&
                    label !== "Kids" && (
                      <LayoutGrid size={18} />
                    )}
                </span>
                <span className="side-label">{label}</span>
                <span className="side-count">—</span>
              </div>
            )
          )}
        </div>
      </aside>
      <main className="home-main">
        <div className="home-header">
          <span className="cat-title">Loading Channels</span>
          <span className="cat-count">— channels</span>
          <span className="res-tag">FHD · HD</span>
          <div className="header-spacer" />
          <button type="button" className="lang-pill" style={{ pointerEvents: "none" }}>
            <Languages size={15} color="#38bdf8" />
            <span style={{ color: "#fff" }}>All Languages</span>
          </button>
        </div>
        <div className="grid-scroll">
          <div
            className="channel-grid channel-grid-skeleton"
            style={{ gridTemplateColumns: "repeat(4, 180px)" }}
            aria-label="Loading channels"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="channel-skeleton"
                style={{ width: 180, height: 140 }}
              >
                <div className="skeleton-icon" style={{ width: 158, height: 82 }} />
                <div className="skeleton-label" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
