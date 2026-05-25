# Novartis HCP Insights Platform: Analytics Architecture Strategy

## 1. The Utility-Weight Metric Framework

Moving away from binary "Correct/Incorrect" paradigms, the new engine will utilize a **multi-dimensional utility vector scoring system**. Every node in the branching logic presents choices that subtly reveal the Healthcare Professional's (HCP) underlying clinical philosophy.

As the HCP progresses, their choices accrue weighted points across predefined clinical vectors, culminating in a nuanced behavioral profile.

### Recommended Core Clinical Vectors
These vectors are specifically tailored to high-stakes pharmaceutical decision-making:

1. **Guideline Adherence vs. Empirical Experience**
   *   *Measures:* How strictly the HCP relies on established clinical pathways (e.g., NCCN, AHA) versus their own historical experience or intuition when faced with ambiguous patient presentations.
   *   *Dynamic Measurement:* Options heavily backed by current guidelines add positive weight. Options representing older standards of care or off-label intuitive leaps shift the weight negatively.
2. **Treatment Aggressiveness & Risk Tolerance**
   *   *Measures:* The threshold at which an HCP is willing to step-up therapy (e.g., moving from a generic standard-of-care to a novel Novartis biologic) versus maintaining a conservative, "watch-and-wait" approach.
   *   *Dynamic Measurement:* Selections that initiate early aggressive intervention or tolerate manageable adverse events for higher efficacy score high on this vector.
3. **Patient-Centricity & Quality of Life (QoL)**
   *   *Measures:* The priority placed on patient lifestyle, administration burden (e.g., oral vs. infusion), out-of-pocket costs, and side-effect profiles over absolute disease modification.
   *   *Dynamic Measurement:* Choices where an HCP alters a treatment plan specifically to accommodate a patient's stated lifestyle concerns accumulate weight here.
4. **Diagnostic Proactivity**
   *   *Measures:* The propensity to utilize advanced, modern diagnostics (e.g., biomarker testing, next-generation sequencing, remote monitoring) early in the patient journey.
   *   *Dynamic Measurement:* Selecting pathways that require biomarker confirmation before treatment initiation scores high; treating empirically without testing scores low.

---

## 2. Novartis-Specific Business & Clinical Analytics

The raw utility weights must be translated into actionable intelligence for different internal stakeholders.

### Audience Segmentation & Clinical Archetypes
*   **Mechanism:** By applying clustering algorithms (e.g., K-Means) to the accumulated weight vectors, the system will group HCPs into defined archetypes.
*   **Example Archetypes:** "Conservative Guideline Followers," "Aggressive Early Adopters," "QoL-Driven Prescribers," or "Hesitant Innovators."
*   **Business Value:** Enables hyper-personalized omnichannel marketing. Commercial teams can target "Conservative" HCPs with long-term safety data, while "Early Adopters" receive advanced mechanism-of-action (MoA) materials.

### Friction Points & Clinical Gaps
*   **Mechanism:** The engine will identify specific nodes in the branching logic where a statistically significant volume of HCPs diverge from the Novartis-optimized clinical pathway.
*   **Analysis:** By cross-referencing these drop-off points with the utility vectors, we understand the *why*. Did they diverge because they are risk-averse, or because they prioritize cost?
*   **Business Value:** Medical Affairs (Medical Directors and MSLs) can instantly identify educational deficits. This drives the rapid development of targeted Continuing Medical Education (CME) or localized symposiums to correct specific clinical misconceptions.

### Event vs. Post-Event Engagement Behavior
*   **Mechanism:** Tracking session completion rates, time-spent-per-node (cognitive load indicators), and drop-off rates, segmented by the point of origin (e.g., Live Congress iPad vs. Post-Event Email Link).
*   **Business Value:** Brand Managers can quantify the ROI of physical congress deployments. They can analyze if the presence of a Novartis rep at a booth influences HCPs to choose more aggressive treatment pathways compared to unguided digital interactions.

---

## 3. Proposed Dashboard Structure

The executive dashboard will be divided into three distinct views, catering to different internal teams.

### Tab 1: Event Engagement & Funnel Performance (Macro View - Brand Leadership)
*Focus: Overall reach, platform health, and campaign ROI.*
*   **Top-Line KPIs:** Total HCPs Engaged, Average Completion Rate, Average Session Time, Engagement by Channel/Region.
*   **Visual 1: The Branching Flow (Sankey Diagram).** A dynamic visualization showing the volume of HCPs flowing through various pathways. Thick branches indicate common choices; dead-ends indicate abandonment.
*   **Visual 2: Cognitive Load Heatmap.** Bar charts indicating average time spent on each specific question, highlighting which clinical scenarios require the most deliberation.
*   **Visual 3: Engagement Velocity.** Line chart tracking interactions over the lifecycle of a specific congress or digital launch.

### Tab 2: Clinical Insights & Knowledge Gaps (Medical Affairs View - MSLs)
*Focus: Identifying educational needs and optimizing scientific messaging.*
*   **Top-Line KPIs:** % Deviation from Optimal Pathway, Top 3 Clinical Misconceptions, Most Selected Non-Guideline Option.
*   **Visual 1: Node-Level Friction Analysis.** Detailed breakdown of critical decision nodes, displaying the distribution of choices and the underlying utility weights associated with the "wrong" choices.
*   **Visual 2: The Vector Radar Chart.** Aggregate radar charts comparing the current HCP population's average vector scores against the "Ideal Novartis Pathway" baseline.
*   **Visual 3: Clinical Gap Highlight Reel.** A ranked list of the specific patient case studies where HCPs scored lowest on the "Guideline Adherence" vector.

### Tab 3: HCP Segment & Behavioral Profiles (Marketing/Commercial View)
*Focus: Targeting, personalization, and Next-Best-Action (NBA).*
*   **Top-Line KPIs:** Distribution of Clinical Archetypes, Highest Converting Segment, Most Engaged Specialty.
*   **Visual 1: Archetype Matrix.** A scatter plot mapping the audience based on two primary vectors (e.g., Risk Tolerance vs. Patient Centricity), visualizing the size and density of each archetype cluster.
*   **Visual 2: Archetype Pathway Preference.** Analysis showing how different archetypes navigated specific critical junctions (e.g., "70% of QoL-Driven Prescribers chose Option B here").
*   **Visual 3: Next-Best-Action Pipeline.** (If integrated with CRM) A data table suggesting the optimal follow-up tactic (e.g., "Send Rep," "Email Efficacy Data," "Invite to Webinar") based on the aggregated archetype data.

---

## 4. The "Analytics Mode" (CMS / Quiz Builder Experience)

A critical consideration is that the user **creating** the quiz in the CMS (e.g., a digital marketer, event producer, or agency partner) is often **not** a medical doctor. Asking non-medical personnel to manually assign complex numerical weights for "Clinical Guideline Adherence" is prone to friction and errors. 

To solve this, the Quiz Builder CMS must include an **"Analytics Mode" toggle** that simplifies the translation of medical strategy into data logic:

### Simplified Vector Tagging (Plain English Translation)
Instead of manually typing `[+2 Guideline Adherence, -1 Risk]`, the CMS uses plain-language dropdowns and sliders. 
*   **Example Prompt:** "Is this answer the standard, safe approach or an aggressive, new approach?" 
*   The creator moves a slider toward "Aggressive," and the CMS automatically generates the underlying utility weights in the code.

### Pre-configured Novartis Archetypes
Medical Affairs can pre-load approved "Archetype Personas" into the CMS. When a marketer builds a new quiz, they simply tag an answer option with "This is what an Early Adopter would choose." The system handles the complex math behind the scenes.

### Visual Path Simulation & "Playtest" Mode
Before publishing, the creator can use Analytics Mode to simulate a run-through. 
*   They can select "Play as a Conservative HCP" and click through the quiz. 
*   The CMS will flag if the pathways lead to unexpected results (e.g., "Warning: A Conservative HCP reached an Aggressive outcome. Please review the weights on Question 4"). This ensures the logic is mathematically sound without requiring a data scientist or Medical Director to QA the math of every quiz.

---

## 5. Technical Strategy & Platform Recommendations

To ensure enterprise scalability, data hygiene, and strict healthcare compliance (HIPAA, GDPR, CCPA), the architecture must decouple the interactive experience from enterprise data warehousing.

### Data Collection & Storage
*   **Stateless Frontend Application:** The interactive quiz (built in React/Next.js or Vue) should be highly performant and handle the complex branching logic locally, remaining stateless regarding Personally Identifiable Information (PII) during the session.
*   **Atomic Telemetry Stream:** Fire lightweight JSON payloads for every interaction (node reached, option selected, time elapsed). These payloads contain only an anonymous Session ID and the associated utility weights.
*   **NoSQL Event Store:** Utilize a highly scalable NoSQL database (e.g., MongoDB, Amazon DynamoDB) to ingest the rapid, unstructured event stream, especially critical during high-traffic physical congresses.

### Enterprise Integration Ecosystem
*   **The Aggregation Middleware:** An intermediary API service (e.g., Node.js, Python/FastAPI) that processes the raw NoSQL event stream upon session completion. It calculates final vector scores and assigns the HCP archetype.
*   **CRM Piping (Veeva / Salesforce Health Cloud):**
    *   If an HCP authenticates (e.g., via badge scan or NPI lookup), the middleware links the anonymous Session ID to their Veeva Profile ID.
    *   **Crucial Pattern:** Push only the *aggregated intelligence* (Archetype, Key Clinical Gaps identified) into Veeva CRM as custom fields or interaction logs. **Do not** push the raw clickstream data into the CRM to avoid bloat and compliance risks.
*   **Data Lake (Snowflake / AWS Redshift):** Raw, anonymized clickstream data is piped here via ETL for advanced data science modeling and powering the Business Intelligence dashboards (Tableau/PowerBI).

### Compliance & Data Governance
*   **PII Decoupling:** Store PII (Name, NPI, Email) in a separate, highly encrypted relational database. Join PII with behavioral data only at the application layer when legally permissible and consented.
*   **Granular Consent Management:** Implement strict, region-specific opt-in gates prior to the experience. If an HCP refuses tracking, the quiz functions normally, but telemetry events are either not fired or immediately purged upon session end.
*   **Data Expiration:** Implement automated TTL (Time-To-Live) policies on raw session data to comply with GDPR right-to-be-forgotten mandates.
