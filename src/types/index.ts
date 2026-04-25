// Shared Types for ASG Monitoring Dashboard

export interface Notification {
  id: number;
  notification_id?: string;
  title: string;
  message: string;
  priority: 'critical' | 'warning' | 'info';
  created_at: string;
}

export interface Crisis {
  id: number;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  status: 'active' | 'resolved';
  created_at: string;
}

export interface NotificationPanelProps {
  notifications: Notification[];
}

export interface CrisisPanelProps {
  crises: Crisis[];
  onResolveCrisis: (id: number) => void;
}

export interface NotificationCardProps {
  id?: string;
  title: string;
  message: string;
  createdAt: string;
}