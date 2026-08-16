import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="M7 3.5h7l3 3V20H7z" /><path d="M14 3.5V7h3" /><path d="M9.5 11h5M9.5 14h5M9.5 17h3" /></BaseIcon>;
}
export function BriefcaseIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M4 11h16M10 11v2h4v-2" /></BaseIcon>;
}
export function CardIcon(props: IconProps) {
  return <BaseIcon {...props}><rect x="4" y="4.5" width="16" height="15" rx="2.5" /><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" /></BaseIcon>;
}
export function TeamIcon(props: IconProps) {
  return <BaseIcon {...props}><circle cx="9" cy="8" r="2.5" /><circle cx="16.5" cy="9" r="2" /><path d="M4.5 18c.4-3 2.1-4.5 4.5-4.5S13.2 15 13.5 18M14 14c2.8 0 4.5 1.3 5 4" /></BaseIcon>;
}
export function UserIcon(props: IconProps) {
  return <BaseIcon {...props}><circle cx="12" cy="8" r="3" /><path d="M6.5 20v-2.2c0-3 2.3-5.3 5.5-5.3s5.5 2.3 5.5 5.3V20z" /></BaseIcon>;
}
export function UploadIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="M4 16.5V19h16v-2.5" /><path d="M12 15V5M8.5 8.5 12 5l3.5 3.5" /><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></BaseIcon>;
}
export function EyeIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="M2.8 12s3.4-5 9.2-5 9.2 5 9.2 5-3.4 5-9.2 5-9.2-5-9.2-5Z" /><circle cx="12" cy="12" r="2.2" /></BaseIcon>;
}
export function ChevronDownIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="m7.5 9.5 4.5 4.5 4.5-4.5" /></BaseIcon>;
}
export function CloseIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="m8 8 8 8M16 8l-8 8" /></BaseIcon>;
}
export function CheckIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="m5 12.5 4 4 10-10" /></BaseIcon>;
}
export function ArrowRightIcon(props: IconProps) {
  return <BaseIcon {...props}><path d="M5 12h14M14 7l5 5-5 5" /></BaseIcon>;
}
