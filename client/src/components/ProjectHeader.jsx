// ──────────────────────────────────────────────
// ProjectHeader — Shows project name, final item
// icon, progress bar, and metadata.
// ──────────────────────────────────────────────

import MinecraftIcon from "./MinecraftIcon.jsx";
import ProgressBar from "./ProgressBar.jsx";

export default function ProjectHeader({ project, progress }) {
  if (!project) return null;

  return (
    <div className="project-header">
      <div className="project-header-icon">
        <MinecraftIcon name={project.finalItem} size={56} />
      </div>
      <div className="project-header-info">
        <h1 className="project-header-name">{project.name}</h1>
        <div className="project-header-meta">
          Final item: <strong>{project.finalItem}</strong>
          {" · "}
          {project.items?.length || 0} items
          {" · "}
          {project.members?.length || 0} member{(project.members?.length || 0) !== 1 ? "s" : ""}
        </div>
        <div className="project-header-progress">
          <ProgressBar
            percent={progress?.percent || 0}
            height={10}
          />
          <span className="project-header-percent">
            {(progress?.percent || 0).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
