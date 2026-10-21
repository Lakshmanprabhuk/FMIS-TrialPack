// app/dashboard/analystSections.js
import {
  PerformanceView,
  GrowthView,
  CustomersView,
  ProductsView,
  RiskView,
  ScenariosView,
  RecommendationsView,
} from './components/Analyst';

/**
 * ANALYST_SECTIONS
 * Sidebar order: Performance → Growth → Customers → Products → Risk → Scenarios → Recommendations
 * groups: 'Performance', 'Customers', 'Products', 'Risk & Outlook', 'Actions'
 *
 * ids must not collide with existing ids:
 *   focus, summary, insights, trends, forecast, compare, pivot, ranking, exceptions, ideas, table, quality
 */
export const ANALYST_SECTIONS = [
  {
    id: 'an-performance',
    group: 'Performance',
    label: 'Performance',
    needs: (analyst) => !!(analyst?.modules?.performance?.data),
    Component: PerformanceView,
  },
  {
    id: 'an-growth',
    group: 'Performance',
    label: 'Growth decomposition',
    needs: (analyst) => !!(analyst?.modules?.growth?.data),
    Component: GrowthView,
  },
  {
    id: 'an-customers',
    group: 'Customers',
    label: 'Customers',
    needs: (analyst) => !!(analyst?.modules?.customers?.data),
    Component: CustomersView,
  },
  {
    id: 'an-products',
    group: 'Products',
    label: 'Products',
    needs: (analyst) => !!(analyst?.modules?.products?.data),
    Component: ProductsView,
  },
  {
    id: 'an-risk',
    group: 'Risk & Outlook',
    label: 'Risk & distribution',
    needs: (analyst) => !!(analyst?.modules?.risk?.data),
    Component: RiskView,
  },
  {
    id: 'an-scenarios',
    group: 'Risk & Outlook',
    label: 'Scenarios & forecast',
    needs: (analyst) => !!(analyst?.modules?.scenarios?.data),
    Component: ScenariosView,
  },
  {
    id: 'an-recommendations',
    group: 'Actions',
    label: 'Recommendations',
    needs: (analyst) => !!(analyst?.modules?.recommendations?.data?.recommendations?.length),
    Component: RecommendationsView,
  },
];
