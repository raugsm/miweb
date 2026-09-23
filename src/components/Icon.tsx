import { iconMap, type IconName } from "@/lib/icons"

type IconProps = {
  name: IconName
  className?: string
}

export function Icon({ name, className }: IconProps) {
  const IconComponent = iconMap[name]

  return <IconComponent aria-hidden="true" className={className} />
}
