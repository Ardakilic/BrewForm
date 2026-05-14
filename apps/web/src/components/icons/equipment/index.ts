import type React from 'react';

export { PortafilterIcon } from './PortafilterIcon.tsx';
export { BasketIcon } from './BasketIcon.tsx';
export { PuckScreenIcon } from './PuckScreenIcon.tsx';
export { PaperFilterIcon } from './PaperFilterIcon.tsx';
export { TamperIcon } from './TamperIcon.tsx';
export { GooseneckKettleIcon } from './GooseneckKettleIcon.tsx';
export { MeshFilterIcon } from './MeshFilterIcon.tsx';
export { CezveIcon } from './CezveIcon.tsx';
export { ScaleIcon } from './ScaleIcon.tsx';
export { ThermometerIcon } from './ThermometerIcon.tsx';
export { OtherIcon } from './OtherIcon.tsx';

import { PortafilterIcon } from './PortafilterIcon.tsx';
import { BasketIcon } from './BasketIcon.tsx';
import { PuckScreenIcon } from './PuckScreenIcon.tsx';
import { PaperFilterIcon } from './PaperFilterIcon.tsx';
import { TamperIcon } from './TamperIcon.tsx';
import { GooseneckKettleIcon } from './GooseneckKettleIcon.tsx';
import { MeshFilterIcon } from './MeshFilterIcon.tsx';
import { CezveIcon } from './CezveIcon.tsx';
import { ScaleIcon } from './ScaleIcon.tsx';
import { ThermometerIcon } from './ThermometerIcon.tsx';
import { OtherIcon } from './OtherIcon.tsx';

interface IconProps {
  size?: number;
  className?: string;
}

const ICON_MAP: Record<string, React.FC<IconProps>> = {
  portafilter: PortafilterIcon,
  basket: BasketIcon,
  puck_screen: PuckScreenIcon,
  paper_filter: PaperFilterIcon,
  tamper: TamperIcon,
  gooseneck_kettle: GooseneckKettleIcon,
  mesh_filter: MeshFilterIcon,
  cezve: CezveIcon,
  scale: ScaleIcon,
  thermometer: ThermometerIcon,
  other: OtherIcon,
};

export function getEquipmentIcon(type: string): React.FC<IconProps> {
  return Object.hasOwn(ICON_MAP, type) ? ICON_MAP[type] : OtherIcon;
}
