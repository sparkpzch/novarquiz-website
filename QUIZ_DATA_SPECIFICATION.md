# Quiz & Analytics Data Specification

This document provides a technical overview of how data is structured, processed, and managed within the platform.

---

## 1. Simplified Editor System (Simplification Conventions)

The Quiz Editor has been streamlined to reduce enterprise bloat while retaining core Novartis-grade analytics.

### A. Simplified Validation & Defaults
The editor no longer enforces strict compliance checks. Only `Question Text` and `Choice Text` are required. Other fields default automatically:
*   `Jurisdiction`: `GLOBAL`
*   `Legal Version`: `v1.0`
*   `Intended Audience`: `public`
*   `Review Status`: `approved`

### B. Smart UI Rules (Audience-Based)
The Editor sidebar dynamically hides fields that are not relevant to the selected **Intended Audience**:

| Field | Public Mode | HCP Mode | Mixed Mode |
| :--- | :--- | :--- | :--- |
| **Utility Score** | ✅ Visible | ❌ Hidden | ✅ Visible |
| **Behavioral Insights** | ❌ Hidden | ✅ Visible | ✅ Visible |
| **Requires HCP Version** | ❌ Hidden | ❌ Hidden | ✅ Visible |
| **Advanced Settings** | ⚙️ Collapsed | ⚙️ Collapsed | ⚙️ Collapsed |

---

## 2. Quiz Data Structure (Graph Model)

The platform uses a **Directed Graph** to manage quiz flow.

### Core Entities
- **Quiz:** The top-level container (Metadata, Session Name).
- **Question (Node):** A point in the graph (`normal`, `situation`, `end`).
- **Choice:** Options within a "Normal" question node.
- **Connection (Edge):** Links a specific **Choice** to a target **Question**.

---

## 3. Analytics & Scoring Engine

The platform tracks two distinct types of data.

### A. Player Performance (The "Game")
- **Utility Score (`score_impact`):** Points for the **Leaderboard** (+10/-10).
- **Streak:** Consecutive correct/positive choices.
- **Total Time:** Cumulative time spent on all nodes.

### B. Behavioral Insights (The "Medical Profiling")
Measures clinical "personality" vectors for Healthcare Professionals (HCPs).

#### Clinical Vectors (Terminology Map)
*   **Vector Deltas** → `Doctor Behavioral Insights`: Defines the doctor's clinical "personality."
*   **Confidence Weight** → `Insight Impact (0-3)`: How much the choice influences the profile.
*   **Behavior Meaning** → `Choice Analysis`: Why the choice is clinically significant.
*   **Clinical Tags** → `Keywords`: For organizing data (e.g., #guideline).
*   **Allowed Usage** → `Data Privacy Mode`: Aggregation level (Aggregate vs. CRM).

#### Scoring Logic
1.  **Clinical Dimensions:** Guideline Adherence, Innovation Adoption, Patient Centricity, Diagnostic Proactivity, Therapy Escalation, Evidence Depth.
2.  **Scoping Guide:**
    - `0`: Neutral/Standard.
    - `+2 to +3`: Small hint of philosophy.
    - `+5`: Strong preference.
    - `+10`: Defining clinical choice.
    - `-5 to -10`: Actions against the clinical vector.

---

## 4. Data Privacy & Compliance

- **Insight Classification:** `aggregate`, `pseudonymous`, or `identified`.
- **Advanced/Novartis Settings:** Enterprise fields tucked in a collapsible folder:
    - Reading Level
    - Jurisdiction Tags
    - Medical Review Version
    - Legal Document Versions
