import type { Role } from '../../store/gameStore';

const LABEL: Record<Role, { text: string; cls: string }> = {
  dealer:     { text: '庄家 Market Maker', cls: 'm-tag-dealer' },
  retail:     { text: '散户 Retail Trader', cls: 'm-tag-retail' },
  regulator:  { text: '监管 SEC Agent',    cls: 'm-tag-reg' },
};

export default function MobileRolePill({ role }: { role: Role }) {
  const def = LABEL[role];
  return (
    <span className={`m-role-pill ${def.cls}`}>
      <span className="dot" />
      {def.text}
    </span>
  );
}
