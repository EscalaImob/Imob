import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const GridIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></IconBase>;
export const TargetIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></IconBase>;
export const FunnelIcon = (props: IconProps) => <IconBase {...props}><path d="M4 5h16l-6.2 7v5.2l-3.6 1.8v-7z"/></IconBase>;
export const UsersIcon = (props: IconProps) => <IconBase {...props}><path d="M16 19v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V19"/><circle cx="9.5" cy="7" r="3"/><path d="M16 4.5a3 3 0 0 1 0 5.8M21 19v-1.5a4 4 0 0 0-3-3.8"/></IconBase>;
export const GlobeIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></IconBase>;
export const BuildingIcon = (props: IconProps) => <IconBase {...props}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></IconBase>;
export const ShareIcon = (props: IconProps) => <IconBase {...props}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></IconBase>;
export const DocumentIcon = (props: IconProps) => <IconBase {...props}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></IconBase>;
export const TasksIcon = (props: IconProps) => <IconBase {...props}><path d="m4 6 1.5 1.5L8 5M11 6h9M4 12l1.5 1.5L8 11M11 12h9M4 18l1.5 1.5L8 17M11 18h9"/></IconBase>;
export const CalendarIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></IconBase>;
export const PinIcon = (props: IconProps) => <IconBase {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></IconBase>;
export const ContractIcon = (props: IconProps) => <IconBase {...props}><path d="M5 3h10l4 4v7"/><path d="M15 3v5h5M5 3v18h7M14 18l2 2 4-5"/></IconBase>;
export const ClipboardIcon = (props: IconProps) => <IconBase {...props}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/></IconBase>;
export const WalletIcon = (props: IconProps) => <IconBase {...props}><path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z"/></IconBase>;
export const ChartIcon = (props: IconProps) => <IconBase {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></IconBase>;
export const SettingsIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1L5 6.1 3 9.5 5 11a7 7 0 0 0 0 2l-2 1.5L5 18l2.4-1a7 7 0 0 0 1.7 1l.4 3h5l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z"/></IconBase>;
export const CardIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></IconBase>;
export const LifeBuoyIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m5.6 5.6 4.3 4.3M14.1 14.1l4.3 4.3M18.4 5.6l-4.3 4.3M9.9 14.1l-4.3 4.3"/></IconBase>;
export const SearchIcon = (props: IconProps) => <IconBase {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></IconBase>;
export const BellIcon = (props: IconProps) => <IconBase {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></IconBase>;
export const ChevronIcon = (props: IconProps) => <IconBase {...props}><path d="m9 7 5 5-5 5"/></IconBase>;
export const CollapseIcon = (props: IconProps) => <IconBase {...props}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 4v16M14 9l-3 3 3 3"/></IconBase>;
export const MenuIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16"/></IconBase>;
export const LogoutIcon = (props: IconProps) => <IconBase {...props}><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></IconBase>;
