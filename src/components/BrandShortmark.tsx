import React from "react";
import Svg, { Circle, Rect } from "react-native-svg";

import { colors } from "../theme";

type BrandShortmarkProps = {
  size?: number;
  backgroundColor?: string;
  lineColor?: string;
  dotColor?: string;
  radius?: number;
};

// SuperMandi v3-c3 shortmark: stacked layers + dot.
export default function BrandShortmark({
  size = 32,
  backgroundColor = colors.primary,
  lineColor = colors.textInverse,
  dotColor = colors.textInverse,
  radius = 8,
}: BrandShortmarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" accessibilityElementsHidden>
      <Rect x={2} y={2} width={28} height={28} rx={radius} fill={backgroundColor} />
      <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill={lineColor} />
      <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill={lineColor} />
      <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill={lineColor} />
      <Circle cx={16} cy={25.3} r={2.1} fill={dotColor} />
    </Svg>
  );
}

