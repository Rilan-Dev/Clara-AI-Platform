import { Suspense, lazy, type ComponentType, type ReactNode } from "react";

type DynamicOptions = {
  loading?: () => ReactNode;
  ssr?: boolean;
};

export default function dynamic<TProps = Record<string, unknown>>(
  loader: () => Promise<{ default: ComponentType<TProps> }>,
  options?: DynamicOptions,
) {
  const LazyComponent = lazy(loader as () => Promise<{ default: ComponentType<any> }>);
  const Loading = options?.loading;

  return function DynamicComponent(props: TProps) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <LazyComponent {...(props as any)} />
      </Suspense>
    );
  };
}
