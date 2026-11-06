import type { ComponentProps, ComponentType, LazyExoticComponent } from 'react';

type RouteComponent<Props> = ComponentType<Props> | LazyExoticComponent<ComponentType<Props>>;

export interface RouteComponents {
  Signup: RouteComponent<ComponentProps<typeof import('./pages/Signup').default>>;
  Home: RouteComponent<ComponentProps<typeof import('./pages/Home').default>>;
  Events: RouteComponent<ComponentProps<typeof import('./pages/Events').default>>;
  BlogList: RouteComponent<ComponentProps<typeof import('./pages/BlogList').default>>;
  BlogPost: RouteComponent<ComponentProps<typeof import('./pages/BlogPost').default>>;
  EventDetail: RouteComponent<ComponentProps<typeof import('./pages/EventDetail').default>>;
  BookConsultation: RouteComponent<ComponentProps<typeof import('./pages/BookConsultation').default>>;
  Auth: RouteComponent<ComponentProps<typeof import('./pages/Auth').default>>;
  ForgotPassword: RouteComponent<ComponentProps<typeof import('./pages/ForgotPassword').default>>;
  VerifyEmail: RouteComponent<ComponentProps<typeof import('./pages/VerifyEmail').default>>;
  NewsletterConfirm: RouteComponent<ComponentProps<typeof import('./pages/NewsletterConfirm').default>>;
  TalentDashboard: RouteComponent<ComponentProps<typeof import('./pages/TalentDashboard').default>>;
  EmployerDashboard: RouteComponent<ComponentProps<typeof import('./pages/EmployerDashboard').default>>;
  AdminContent: RouteComponent<ComponentProps<typeof import('./pages/admin/AdminContent').default>>;
  AdminData: RouteComponent<ComponentProps<typeof import('./pages/admin/AdminData').default>>;
  AdminAuditLog: RouteComponent<ComponentProps<typeof import('./pages/admin/AdminAuditLog').default>>;
  AdminOversight: RouteComponent<ComponentProps<typeof import('./pages/admin/AdminOversight').default>>;
  AdminSetPassword: RouteComponent<ComponentProps<typeof import('./pages/admin/AdminSetPassword').default>>;
  AdminStaff: RouteComponent<ComponentProps<typeof import('./pages/admin/AdminStaff').default>>;
  AdminStats: RouteComponent<ComponentProps<typeof import('./pages/admin/AdminStats').default>>;
  AdminEmailTemplates: RouteComponent<
    ComponentProps<typeof import('./pages/admin/AdminEmailTemplates').default>
  >;
  ManagerLogin: RouteComponent<ComponentProps<typeof import('./pages/admin/ManagerLogin').default>>;
  Terms: RouteComponent<ComponentProps<typeof import('./pages/Terms').default>>;
  Privacy: RouteComponent<ComponentProps<typeof import('./pages/Privacy').default>>;
  NotFound: RouteComponent<ComponentProps<typeof import('./pages/NotFound').default>>;
}
