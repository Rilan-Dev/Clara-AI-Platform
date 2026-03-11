import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router-dom";
import React from "react";

type NextLinkProps = Omit<RouterLinkProps, "to"> & {
  href: string;
  children?: React.ReactNode;
  className?: string;
};

export default function Link({ href, children, ...rest }: NextLinkProps) {
  return (
    <RouterLink to={href} {...rest}>
      {children}
    </RouterLink>
  );
}
