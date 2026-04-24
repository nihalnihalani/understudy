import { useRef, useState } from "react";
import { motion, useMotionTemplate, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface InteractiveCardProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

export const InteractiveCard = ({
  children,
  className,
  containerClassName,
}: InteractiveCardProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const [hovered, setHovered] = useState(false);

  const mouseX = useSpring(0, { stiffness: 500, damping: 100 });
  const mouseY = useSpring(0, { stiffness: 500, damping: 100 });

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const rotateX = useTransform(mouseY, [0, 400], [5, -5]);
  const rotateY = useTransform(mouseX, [0, 400], [ -5, 5]);

  return (
    <div
      className={cn("perspective-1000", containerClassName)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        ref={ref}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        whileHover={{ scale: 1.01 }}
        className={cn(
          "relative rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-300 ease-out overflow-hidden",
          hovered && "shadow-lg border-border-strong",
          className
        )}
      >
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: useMotionTemplate`
              radial-gradient(
                350px circle at ${mouseX}px ${mouseY}px,
                hsl(var(--primary) / 0.05),
                transparent 80%
              )
            `,
          }}
        />
        <div className="relative z-10" style={{ transform: "translateZ(20px)" }}>
          {children}
        </div>
      </motion.div>
    </div>
  );
};
