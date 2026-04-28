# Project Plan: Creative Planner for Minecraft Let's Play

## 1. Project Vision
To create a specialized planning application for a theme-based Minecraft Let's Play series. The series aims to foster a community built on **hope, love, and social connection**.

### Core Philosophy
*   **Family Friendly:** Strictly no scary themes (e.g., no Halloween, horror). A safe space for all ages.
*   **Faith-Inspired:** Subtly weaving in the Word of God and Bible verses.
    *   *Concept:* We are made in God's image -> We are creative beings.
    *   *Goal:* Use building and creativity to demonstrate this truth.
    *   *Approach:* Not explicitly "Christian-branded" to alienate, but teaching the same wholesome practices and values to welcome everyone into the family.
*   **Community Driven:** Themes for episodes are chosen by the creator or the community to create a dynamic interaction.
*   **Hope & Motivation:** Inspiring viewers who are struggling, showing them hope for the future and the present through the content and the "Realness of God."

## 2. Functional Requirements

### A. Theme & Content Management
*   **Dynamic Theme Database:** A service system to add, update, and manage themes (e.g., "Hope", "Community", "Restoration").
*   **Episode Planning:** Link episodes to specific themes.
*   **Lore & Reference System:**
    *   Ability to store and link Bible verses/references to specific builds or story beats.
    *   "Deep Story" features to track lore accumulation over time.
    *   Goal: Build towards a grand, inspiring story/movie based on the accumulated lore.

### B. Integrated Creative Tools
*   **Mindmap Integration:**
    *   Directly integrated into the planner.
    *   Convert Mindmap nodes (Ideas/Themes) into actionable Story/Script items.
*   **Story/Script Editor:**
    *   Rich text editor for writing scripts.
    *   Sidebar/Widget for quick access to the Theme/Reference database while writing.

### C. Collaboration & Sharing
*   **Custom File Format:** (e.g., `.cplan` or similar).
    *   Acts like a project file (similar to `.psd` or `.ai`).
    *   Encapsulates plans, scripts, mindmaps, and assets.
    *   Easy Import/Export for sharing with contributors.

### D. User Interface (GUI) & UX
*   **Intuitive Design:** Clean, modern, and practical.
*   **Efficiency:** No repeating buttons or impractical workflows.
*   **Aesthetics:** "Nice looking" and inspiring interface.
*   **Consistency:** All popups/modals must be custom app components (no native browser alerts/confirms).

## 3. Roadmap

### Phase 1: Foundation & Planning (Current)
- [x] Initialize Project (Next.js + Tauri).
- [x] Basic Navigation (Home, Mindmap, Files).
- [x] **Action:** Create this Plan document.
- [x] **Action:** Review current GUI for redundancy and flow.

### Phase 1.5: File Browser & UX Refinement (Completed)
- [x] **File Browser Core:** Implemented Chonky file browser with custom actions.
- [x] **Unified Delete Logic:** Consolidated deletion into a single secure action handling both right-click targets and multi-selection.
- [x] **Custom Modals:** Replaced native alerts with custom React modals for Delete confirmation, Rename, and Creation.
- [x] **Locking System:** Implemented File/Folder locking to prevent accidental changes.
- [x] **System Protection:** Added safeguards for critical folders ("Themes", "Episodes").
- [x] **Drag & Drop:** Enabled importing files via drag-and-drop from OS.
- [x] **Tabbed Navigation:** Added browser-like tabs for directory navigation.
- [x] **Search:** Implemented real-time file search.

### Phase 2: Core Features Implementation (Completed)
- [x] **Theme Service:** Create a database/store for Themes.
- [x] **Reference System:** Add ability to tag items with Bible verses/Notes.
- [x] **Mindmap-to-Script:** Implement drag-and-drop or conversion logic from Mindmap to Storyboard.

### Phase 3: Mindmap Revolution (Completed)
- [x] **Categorization:** Implement sub-folders/categories for mindmap nodes (e.g., "Characters", "Plot", "Builds").
- [x] **Enhanced UX:** 
    - [x] Custom "Smart" Nodes with hover actions (Add Child, Delete).
    - [x] Interactive Edges with delete buttons.
    - [x] Replaced native browser alerts with custom `Modal` components.
- [x] **Structure:** Ensure mindmaps are saved within a specific `mindmap/` subfolder in the project.

### Phase 4: Data Architecture & "App Store" (Completed)
- [x] **Strict Folder Hierarchy:** Enforce the following structure for every project:
    *   `ProjectRoot/`
        *   `theme.json` (The main "Brain" file)
        *   `mindmap/` (Folder for all mindmap data)
        *   `storyboard/` (Folder for script documents)
- [x] **Data Layer:** Update the "Store" to handle this nested structure automatically.
- [x] **App Store:** Basic Plugin Store UI and Data persistence (`plugins.json`).

### Phase 5: Theme Integration (Priority 3)
- [ ] **Central Linkage:** Ensure the Theme file acts as the master controller, linking specific mindmaps to specific storyboards.

### Phase 6: Storyboard 2.0 (Priority 4)
- [ ] **"Google Docs" Quality:** Upgrade the editor with advanced formatting, layout, and responsiveness.
- [ ] **PDF Export:** Add functionality to export the storyboard/script as a professional PDF.

### Phase 7: Dashboard & Unification (Priority 5)
- [ ] **Dashboard:** Create a main dashboard that integrates all parts (Theme, Mindmap, Storyboard) into a cohesive view.

### Phase 8: File System & Collaboration
- [ ] **Custom Format:** Define the JSON structure for the project file.
- [ ] **Import/Export:** Build the logic to save/load these files.

### Phase 9: Polish & "Deep Story" Tools
- [ ] **Lore Tracker:** A timeline or wiki-like feature for project lore.
- [ ] **Community Voting:** (Potential future feature) Integration for community theme voting.

## 4. Technical Stack
*   **Frontend:** Next.js, Tailwind CSS, React Flow (Mindmap), Tiptap (Editor).
*   **Backend/Local:** Tauri (Rust) for local file management.
*   **State:** Zustand (Store).

---
*This document will be updated as the project evolves.*
