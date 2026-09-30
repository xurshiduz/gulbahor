/**
 * Sahifa sarlavhasi va tavsifi. React 19 <title> va <meta> ni o'zi
 * <head> ga ko'chiradi - alohida kutubxona kerak emas.
 */
const PageMeta = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <>
    <title>{title}</title>
    <meta name="description" content={description} />
  </>
);

export const AppWrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export default PageMeta;
