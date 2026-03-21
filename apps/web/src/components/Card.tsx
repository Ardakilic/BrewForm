import { Card as BaseuiCard, hasThumbnail as defaultHasThumbnail } from 'baseui/card';
import type { CardProps } from 'baseui/card';

type Props = Omit<CardProps, 'hasThumbnail' | 'overrides'> & {
  hasThumbnail?: CardProps['hasThumbnail'];
  overrides?: CardProps['overrides'];
};

export function Card({ hasThumbnail = defaultHasThumbnail, overrides = {}, ...rest }: Props) {
  return <BaseuiCard hasThumbnail={hasThumbnail} overrides={overrides} {...rest} />;
}
