import { ReactNode } from "react";

interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon = "📭", title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-base font-medium text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
