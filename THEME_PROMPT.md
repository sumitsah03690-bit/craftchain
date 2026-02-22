I need you to restyle my web app to look like Minecraft. ONLY edit the file client/src/index.css. Do NOT touch any .jsx files.

TECH: React + Vite. All CSS is in one file: client/src/index.css (~1800 lines). No Tailwind. Plain CSS with CSS variables in :root.

LAYOUT: 3-panel layout like Discord.

- .sidebar (240px left nav)
- .main-content OR .project-main (center area)
- .project-right (300px right sidebar)
- .auth-layout (full-screen login/signup)
- All wrapped in .app-layout (flex, 100vh)

PROBLEM: I set a Minecraft background image on body but EVERY panel has opaque solid backgrounds covering it completely. The bg image exists at public/assets/minecraft-bg.png and is served at /assets/minecraft-bg.png.

WHAT TO DO:

1. Body background: Use the Minecraft image with a dark semi-transparent overlay so text is readable:
   body { background: linear-gradient(rgba(10,8,5,0.7), rgba(10,8,5,0.8)), url("/assets/minecraft-bg.png"); background-size: cover; background-position: center; background-attachment: fixed; }

2. Make ALL layout panels semi-transparent so the bg shows through:

- .sidebar → background: rgba(26,20,16,0.92); backdrop-filter: blur(12px);
- .main-content → background: rgba(26,20,16,0.75); backdrop-filter: blur(8px);
- .project-main → background: rgba(26,20,16,0.75); backdrop-filter: blur(8px);
- .project-right → background: rgba(26,20,16,0.88); backdrop-filter: blur(12px);
- .auth-layout → background: rgba(26,20,16,0.6); backdrop-filter: blur(6px);
- .main-area → background: transparent;

3. Minecraft earthy color palette for :root variables:
   --bg-darkest: #1a1410;
   --bg-dark: #2a221a;
   --bg-medium: #342b22;
   --bg-light: #3e342a;
   --bg-hover: #4a3f33;
   --text-primary: #e8dcc8;
   --text-secondary: #b8a98e;
   --text-muted: #7a6c56;
   --mc-green: #5d9b3a;
   --mc-green-dark: #4a7d2e;
   --mc-gold: #f1c40f;
   --card-bg: #2a221a;
   --card-border: #443a2e;

4. Blocky Minecraft feel:

- Border radius should be small (2-4px), not rounded
- Cards (.card) should have 2px solid borders with inset shadow: box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 4px rgba(0,0,0,0.4);
- Buttons (.btn-primary) should be grass green #5d9b3a
- Section headers use font-family: "Press Start 2P", monospace (already set as --font-pixel)

5. Sidebar should have a green grass stripe on top: .sidebar-logo { border-top: 3px solid #5d9b3a; }

6. DO NOT add animations or npm packages. Keep transitions at 0.15s. Only modify CSS.

EXISTING CSS CLASSES TO FIND AND EDIT (search for these in index.css):

- body { ... }
- .app-layout { ... }
- .sidebar { ... }
- .main-area { ... }
- .main-content { ... }
- .project-main { ... }
- .project-right { ... }
- .auth-layout { ... }
- .card { ... }
- .btn-primary { ... }
- :root { ... }
