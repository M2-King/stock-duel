import type { Role } from '../../store/gameStore';

const LABEL: Record<Role, { text: string; cls: string }> = {
  dealer:     { text: '庄家 Market Maker', cls: 'role-dealer' },
  retail:     { text: '散户 Retail Trader', cls: 'role-retail' },
  regulator:  { text: '监管 SEC Agent',     cls: 'role-reg' },
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
