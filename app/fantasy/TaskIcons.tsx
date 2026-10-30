// Tehtävien kuvakkeet (omat piirrokset, jalkapalloteema): taktiikkataulu, pelipaita, kapteenin nauha, tulostaulu,
// pallo maalissa ja syöttö. Väri tulee tekstin väristä (currentColor).
const sv = (d: React.ReactNode, size = 22) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{d}</svg>
);

/** Tehtävät: taktiikkataulu (merkki → syöttöviiva → pallo) */
export const TasksIcon = ({ size = 22 }: { size?: number }) => sv(<>
  <rect x="4.5" y="4" width="15" height="17.5" rx="2.5" /><path d="M9 4V2.8h6V4" />
  <path d="M8 9.2l2 2M10 9.2l-2 2" strokeWidth="1.9" />
  <path d="M9.6 13.4c.6 2.4 2.4 3.3 4.2 3.1" strokeDasharray="1.6 1.9" strokeWidth="1.7" />
  <circle cx="15.6" cy="16.2" r="1.9" fill="currentColor" stroke="none" />
</>, size);

export type TaskKind = "participate" | "captain" | "points" | "goals" | "assists";
export const TASK_ICON: Record<TaskKind, React.ReactNode> = {
  // pelipaita: joukkue mukana kierroksella
  participate: sv(<path d="M8 3 4 5 2 9l3 2 1-1v10h12V10l1 1 3-2-2-4-4-2c-.5 2-2 3-4 3S8.5 5 8 3Z" />),
  // kapteenin nauha
  captain: sv(<><path d="M3 7.5c3-.9 15-.9 18 0v9c-3 .9-15 .9-18 0z" /><path d="M14.6 9.6a3.1 3.1 0 1 0 0 4.8" strokeWidth="2.4" /></>),
  // tulostaulu
  points: sv(<><rect x="2.5" y="6" width="19" height="12.5" rx="2.2" /><path d="M12 6v12.5M7.2 9.8v5.2M5.9 11l1.3-1.2M15 9.8h3v5.2h-3z" strokeWidth="1.9" /><path d="M8 3.5l1.5 2.5M16 3.5 14.5 6" strokeWidth="1.9" /></>),
  // pallo maalissa
  goals: sv(<><path d="M2.5 19V6.5h19V19" /><path d="M6.8 6.5V13M12 6.5V11M17.2 6.5V13M2.5 10h19" strokeWidth="1.2" opacity=".55" /><circle cx="12" cy="15.6" r="3.3" fill="currentColor" stroke="none" /><path d="M1.5 19h21" /></>),
  // syöttö: kaareva syöttöviiva palloon
  assists: sv(<><path d="M3.5 19.5c3.5-1 7-4.3 9.3-9" strokeDasharray="2.2 2.6" /><path d="m10.3 9.4 2.6.8.6-2.7" strokeWidth="2" /><circle cx="17.5" cy="6.5" r="3.6" /><path d="M17.5 4.6l1.7 1.3-.6 2h-2.2l-.6-2z" fill="currentColor" strokeWidth="1" /></>),
};
