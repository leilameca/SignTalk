import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
  color?: string;
}

/** Animated intertwined hands logo for SignTalk */
export const LogoIntertwinedHands: React.FC<IconProps & { animated?: boolean }> = ({
  className = "w-16 h-16",
  color = "currentColor",
  animated = false,
}) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} ${animated ? 'animate-pulse' : ''}`}
  >
    {/* Soft subtle glow ring */}
    <circle cx="50" cy="50" r="42" stroke={color} strokeWidth="1.5" strokeOpacity="0.2" strokeDasharray="4 4" />
    
    {/* Left Hand Outline */}
    <path
      d="M32 72C32 72 26 58 28 48C29.5 40.5 35 38 38 45C38 38 43 35 46 42C46 36 51 34 54 41C54 36 58 35 60 41C62 47 62 55 58 64C54 73 44 76 32 72Z"
      stroke={color}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    
    {/* Right Hand Intertwined Outline */}
    <path
      d="M68 28C68 28 74 42 72 52C70.5 59.5 65 62 62 55C62 62 57 65 54 58C54 64 49 66 46 59C46 64 42 65 40 59C38 53 38 45 42 36C46 27 56 24 68 28Z"
      stroke={color}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />

    {/* Hand Joint Micro Connection Lines */}
    <path d="M40 48L44 54M48 45L51 51M54 44L56 49" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.8" />
    <circle cx="50" cy="50" r="3" fill={color} />
  </svg>
);

/** Hand Greeting (Greetings / Saludos) */
export const HandGreetingIcon: React.FC<IconProps> = ({ className = "w-6 h-6", color = "currentColor" }) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M12 28V16C12 14.3 13.3 13 15 13C16.7 13 18 14.3 18 16V22M18 22V12C18 10.3 19.3 9 21 9C22.7 9 24 10.3 24 12V22M24 22V13.5C24 11.8 25.3 10.5 27 10.5C28.7 10.5 30 11.8 30 13.5V22M30 22V17C30 15.3 31.3 14 33 14C34.7 14 36 15.3 36 17V30C36 36.6 30.6 42 24 42C17.4 42 12 36.6 12 30V28"
      stroke={color}
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Wave arc indicator */}
    <path d="M38 10C40 12 41 15 41 18M7 10C5 12 4 15 4 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/** Hand Health / Heart Gesture (Health / Salud) */
export const HandHealthIcon: React.FC<IconProps> = ({ className = "w-6 h-6", color = "currentColor" }) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M24 40S10 30 10 18A8 8 0 0 1 24 12A8 8 0 0 1 38 18C38 30 24 40 24 40Z"
      stroke={color}
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Cross/Health plus symbol in center */}
    <path d="M24 18V26M20 22H28" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

/** Hand Emergency / Help Gesture (Emergency / Emergencia) */
export const HandEmergencyIcon: React.FC<IconProps> = ({ className = "w-6 h-6", color = "currentColor" }) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M24 6L42 38H6L24 6Z"
      stroke={color}
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M24 18V26M24 31V33" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/** Hand Shopping / Bag Gesture (Shopping / Compras) */
export const HandShoppingIcon: React.FC<IconProps> = ({ className = "w-6 h-6", color = "currentColor" }) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M10 16H38L35 40H13L10 16Z"
      stroke={color}
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 16V12C17 8.7 19.7 6 23 6H25C28.3 6 31 8.7 31 12V16"
      stroke={color}
      strokeWidth="2.8"
      strokeLinecap="round"
    />
  </svg>
);

/** Hand Sign Gesture Diagram (I Love You / ASL Gesture) */
export const HandILoveYouGesture: React.FC<IconProps> = ({ className = "w-12 h-12", color = "currentColor" }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M16 28L8 24C6.5 23 6 21 7 19.5C8 18 10 17.5 11.5 18.5L20 24M20 28V12C20 10 21.5 8.5 23.5 8.5C25.5 8.5 27 10 27 12V30M27 30V24C27 22 28.5 20.5 30.5 20.5C32.5 20.5 34 22 34 24V32M34 32V26C34 24 35.5 22.5 37.5 22.5C39.5 22.5 41 24 41 26V32M41 28V16C41 14 42.5 12.5 44.5 12.5C46.5 12.5 48 14 48 16V38C48 48 40 56 30 56C20 56 16 46 16 38V28Z"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="23.5" cy="12" r="2" fill={color} />
    <circle cx="44.5" cy="16" r="2" fill={color} />
  </svg>
);

/** Hand Open Palm (Thank you / Gracias) */
export const HandOpenPalmGesture: React.FC<IconProps> = ({ className = "w-12 h-12", color = "currentColor" }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M18 36V18C18 15.8 19.8 14 22 14C24.2 14 26 15.8 26 18V32M26 32V14C26 11.8 27.8 10 30 10C32.2 10 34 11.8 34 14V32M34 32V16C34 13.8 35.8 12 38 12C40.2 12 42 13.8 42 16V32M42 32V20C42 17.8 43.8 16 46 16C48.2 16 50 17.8 50 20V38C50 48 41 54 32 54C23 54 18 46 18 38V36Z"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M18 36L12 32C10.5 31 10 29 11 27.5C12 26 14 25.5 15.5 26.5L22 30" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/** Hand Fist Gesture (Help / Ayuda) */
export const HandFistGesture: React.FC<IconProps> = ({ className = "w-12 h-12", color = "currentColor" }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="20" y="20" width="28" height="24" rx="6" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <path d="M16 28C16 25 18 22 22 22L36 28C38 29 38 32 36 33L24 35" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <path d="M26 20V44M33 20V44M40 20V44" stroke={color} strokeWidth="2" strokeOpacity="0.4" />
  </svg>
);

/** Hand Pointer Gesture (Direction / Ubicación) */
export const HandPointGesture: React.FC<IconProps> = ({ className = "w-12 h-12", color = "currentColor" }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M32 10V32M32 10C32 8 30.5 6.5 28.5 6.5C26.5 6.5 25 8 25 10V28M25 28C25 28 20 28 18 32C16 36 18 42 22 48C26 54 36 54 42 48C46 44 48 38 48 32V26C48 24 46.5 22.5 44.5 22.5C42.5 22.5 41 24 41 26V30"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
