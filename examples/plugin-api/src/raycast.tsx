import type { ReactElement, ReactNode } from "react";
import { Children, cloneElement, createElement, isValidElement } from "react";

function slotChildren(children?: ReactNode, trailing?: ReactNode): ReactNode {
  const body = keyedSlotChildren(children, "body");
  const slot = keyedSlotChildren(trailing, "slot");
  return [...body, ...slot];
}

function keyedSlotChildren(children: ReactNode, prefix: string): ReactNode[] {
  return Children.toArray(children).map((child, index) => {
    if (!isValidElement(child)) {
      return child;
    }

    return cloneElement(child, {
      key: `${prefix}-${child.key ?? index}`,
    });
  });
}

export interface ListProps {
  children?: ReactNode;
  searchText?: string;
  searchBarPlaceholder?: string;
  isLoading?: boolean;
  isShowingDetail?: boolean;
  filtering?: boolean;
  selectedItemId?: string;
  onSearchTextChange?: (text: string) => void;
  onSelectionChange?: (id: string) => void;
}

export interface ListItemProps {
  children?: ReactNode;
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  keywords?: string[];
  accessories?: string[];
}

export interface ListSectionProps {
  children?: ReactNode;
  title?: string;
}

export interface SearchBarDropdownProps {
  children?: ReactNode;
  tooltip?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export interface SearchBarDropdownItemProps {
  value: string;
  title: string;
  icon?: string;
}

export interface ListItemDetailProps {
  markdown?: string;
  metadata?: ReactNode;
  isLoading?: boolean;
  children?: ReactNode;
}

export interface MetadataProps {
  children?: ReactNode;
}

export interface MetadataLabelProps {
  title: string;
  text?: string;
  icon?: string;
}

export interface MetadataSeparatorProps {}

export interface ImageProps {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  fit?: "contain" | "cover" | "fill";
}

interface ListItemDetailMetadataComponent {
  (props: MetadataProps): ReactElement;
  Label: (props: MetadataLabelProps) => ReactElement;
  Separator: (props: MetadataSeparatorProps) => ReactElement;
}

interface ListItemDetailComponent {
  (props: ListItemDetailProps): ReactElement;
  Metadata: ListItemDetailMetadataComponent;
}

interface ListItemComponent {
  (props: ListItemProps): ReactElement;
  Detail: ListItemDetailComponent;
}

interface ListComponent {
  (props: ListProps): ReactElement;
  Item: ListItemComponent;
  Section: (props: ListSectionProps) => ReactElement;
  Dropdown: SearchBarDropdownComponent;
}

interface SearchBarDropdownComponent {
  (props: SearchBarDropdownProps): ReactElement;
  Item: (props: SearchBarDropdownItemProps) => ReactElement;
}

function ListRoot({
  children,
  searchText,
  searchBarPlaceholder,
  isLoading,
  isShowingDetail,
  filtering = true,
  selectedItemId,
  onSearchTextChange,
  onSelectionChange,
}: ListProps): ReactElement {
  return createElement(
    "List",
    {
      searchText,
      searchBarPlaceholder,
      isLoading,
      isShowingDetail,
      filtering,
      selectedItemId,
      onSearchTextChange,
      onSelectionChange,
    },
    children,
  );
}

function ListItemRoot({
  children,
  id,
  title,
  subtitle,
  icon,
  keywords,
  accessories,
}: ListItemProps): ReactElement {
  return createElement(
    "ListItem",
    {
      id,
      title,
      subtitle,
      icon,
      keywords,
      accessories,
    },
    children,
  );
}

function ListSection({ children, title }: ListSectionProps): ReactElement {
  return createElement("ListSection", { title }, children);
}

function ListDropdown({
  children,
  tooltip,
  value,
  defaultValue,
  onChange,
}: SearchBarDropdownProps): ReactElement {
  return createElement(
    "ListDropdown",
    { tooltip, value, defaultValue, onChange },
    children,
  );
}

function ListDropdownItem({
  value,
  title,
  icon,
}: SearchBarDropdownItemProps): ReactElement {
  return createElement("ListDropdownItem", { value, title, icon });
}

function ListItemDetail({
  markdown,
  metadata,
  isLoading,
  children,
}: ListItemDetailProps): ReactElement {
  return createElement(
    "ListItemDetail",
    { markdown, isLoading },
    metadata,
    children,
  );
}

function ListItemDetailMetadata({ children }: MetadataProps): ReactElement {
  return createElement("ListItemDetailMetadata", {}, children);
}

function ListItemDetailMetadataLabel({
  title,
  text,
  icon,
}: MetadataLabelProps): ReactElement {
  return createElement("ListItemDetailMetadataLabel", { title, text, icon });
}

function ListItemDetailMetadataSeparator(
  _props: MetadataSeparatorProps,
): ReactElement {
  return createElement("ListItemDetailMetadataSeparator");
}

export function Image({
  src,
  alt,
  width,
  height,
  fit = "contain",
}: ImageProps): ReactElement {
  return createElement("img", { src, alt, width, height, fit });
}

const ListItemDetailMetadataComponent: ListItemDetailMetadataComponent =
  Object.assign(ListItemDetailMetadata, {
    Label: ListItemDetailMetadataLabel,
    Separator: ListItemDetailMetadataSeparator,
  });

const ListItemDetailComponent: ListItemDetailComponent = Object.assign(
  ListItemDetail,
  {
    Metadata: ListItemDetailMetadataComponent,
  },
);

const ListItemComponent: ListItemComponent = Object.assign(ListItemRoot, {
  Detail: ListItemDetailComponent,
});

export const List: ListComponent = Object.assign(ListRoot, {
  Item: ListItemComponent,
  Section: ListSection,
  Dropdown: Object.assign(ListDropdown, { Item: ListDropdownItem }),
});

export interface DetailProps {
  markdown?: string;
  metadata?: ReactNode;
  actions?: ReactNode;
  isLoading?: boolean;
  children?: ReactNode;
}

interface DetailMetadataComponent {
  (props: MetadataProps): ReactElement;
  Label: (props: MetadataLabelProps) => ReactElement;
  Separator: (props: MetadataSeparatorProps) => ReactElement;
}

interface DetailComponent {
  (props: DetailProps): ReactElement;
  Metadata: DetailMetadataComponent;
}

function DetailRoot({
  markdown,
  metadata,
  actions,
  isLoading,
  children,
}: DetailProps): ReactElement {
  return createElement(
    "Detail",
    { markdown, isLoading },
    slotChildren(metadata, slotChildren(children, actions)),
  );
}

function DetailMetadata({ children }: MetadataProps): ReactElement {
  return createElement("DetailMetadata", {}, children);
}

function DetailMetadataLabel({
  title,
  text,
  icon,
}: MetadataLabelProps): ReactElement {
  return createElement("DetailMetadataLabel", { title, text, icon });
}

function DetailMetadataSeparator(_props: MetadataSeparatorProps): ReactElement {
  return createElement("DetailMetadataSeparator");
}

const DetailMetadataComponent: DetailMetadataComponent = Object.assign(
  DetailMetadata,
  {
    Label: DetailMetadataLabel,
    Separator: DetailMetadataSeparator,
  },
);

export const Detail: DetailComponent = Object.assign(DetailRoot, {
  Metadata: DetailMetadataComponent,
});

export interface EmptyViewProps {
  title: string;
  description?: string;
  icon?: string;
}

export function EmptyView({
  title,
  description,
  icon,
}: EmptyViewProps): ReactElement {
  return createElement("EmptyView", { title, description, icon });
}

export interface ActionPanelProps {
  children?: ReactNode;
  title?: string;
}

export function ActionPanel({
  children,
  title,
}: ActionPanelProps): ReactElement {
  return createElement("ActionPanel", { title }, children);
}

export interface ActionProps {
  title: string;
  icon?: string;
  shortcut?: string;
  style?: "regular" | "primary" | "destructive";
  disabled?: boolean;
  onAction?: () => void;
}

export function Action({
  title,
  icon,
  shortcut,
  style = "regular",
  disabled,
  onAction,
}: ActionProps): ReactElement {
  return createElement("Action", {
    title,
    icon,
    shortcut,
    style,
    disabled,
    onAction,
  });
}

export interface GridProps {
  children?: ReactNode;
  searchText?: string;
  searchBarPlaceholder?: string;
  isLoading?: boolean;
  filtering?: boolean;
  selectedItemId?: string;
  columns?: number;
  onSearchTextChange?: (text: string) => void;
  onSelectionChange?: (id: string) => void;
}

export interface GridItemProps {
  children?: ReactNode;
  id: string;
  title?: string;
  subtitle?: string;
  content: string;
  keywords?: string[];
}

export interface GridSectionProps {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
}

interface GridComponent {
  (props: GridProps): ReactElement;
  Item: (props: GridItemProps) => ReactElement;
  Section: (props: GridSectionProps) => ReactElement;
  Dropdown: SearchBarDropdownComponent;
}

function GridRoot({
  children,
  searchText,
  searchBarPlaceholder,
  isLoading,
  filtering = true,
  selectedItemId,
  columns,
  onSearchTextChange,
  onSelectionChange,
}: GridProps): ReactElement {
  return createElement(
    "Grid",
    {
      searchText,
      searchBarPlaceholder,
      isLoading,
      filtering,
      selectedItemId,
      columns,
      onSearchTextChange,
      onSelectionChange,
    },
    children,
  );
}

function GridItem({
  children,
  id,
  title,
  subtitle,
  content,
  keywords,
}: GridItemProps): ReactElement {
  return createElement(
    "GridItem",
    {
      id,
      title,
      subtitle,
      content,
      keywords,
    },
    children,
  );
}

function GridSection({
  children,
  title,
  subtitle,
}: GridSectionProps): ReactElement {
  return createElement("GridSection", { title, subtitle }, children);
}

function GridDropdown({
  children,
  tooltip,
  value,
  defaultValue,
  onChange,
}: SearchBarDropdownProps): ReactElement {
  return createElement(
    "GridDropdown",
    { tooltip, value, defaultValue, onChange },
    children,
  );
}

function GridDropdownItem({
  value,
  title,
  icon,
}: SearchBarDropdownItemProps): ReactElement {
  return createElement("GridDropdownItem", { value, title, icon });
}

export const Grid: GridComponent = Object.assign(GridRoot, {
  Item: GridItem,
  Section: GridSection,
  Dropdown: Object.assign(GridDropdown, { Item: GridDropdownItem }),
});

export interface FormProps {
  children?: ReactNode;
  actions?: ReactNode;
  isLoading?: boolean;
}

export interface FormTextFieldProps {
  id: string;
  title: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

export interface FormPasswordFieldProps extends FormTextFieldProps {}

export interface FormTextAreaProps extends FormTextFieldProps {}

export interface FormCheckboxProps {
  id: string;
  label: string;
  value?: boolean;
  defaultValue?: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}

export interface FormDropdownProps {
  id: string;
  title: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  children?: ReactNode;
  onChange?: (value: string) => void;
}

export interface FormDropdownItemProps {
  value: string;
  title: string;
  icon?: string;
}

export interface FormSeparatorProps {}

interface FormDropdownComponent {
  (props: FormDropdownProps): ReactElement;
  Item: (props: FormDropdownItemProps) => ReactElement;
}

interface FormComponent {
  (props: FormProps): ReactElement;
  TextField: (props: FormTextFieldProps) => ReactElement;
  PasswordField: (props: FormPasswordFieldProps) => ReactElement;
  TextArea: (props: FormTextAreaProps) => ReactElement;
  Checkbox: (props: FormCheckboxProps) => ReactElement;
  Dropdown: FormDropdownComponent;
  Separator: (props: FormSeparatorProps) => ReactElement;
}

function FormRoot({ children, actions, isLoading }: FormProps): ReactElement {
  return createElement("Form", { isLoading }, slotChildren(children, actions));
}

function FormTextField({
  id,
  title,
  value,
  defaultValue,
  placeholder,
  disabled,
  onChange,
}: FormTextFieldProps): ReactElement {
  return createElement("FormTextField", {
    id,
    title,
    value,
    defaultValue,
    placeholder,
    disabled,
    onChange,
  });
}

function FormPasswordField(props: FormPasswordFieldProps): ReactElement {
  return createElement("FormPasswordField", props);
}

function FormTextArea({
  id,
  title,
  value,
  defaultValue,
  placeholder,
  disabled,
  onChange,
}: FormTextAreaProps): ReactElement {
  return createElement("FormTextArea", {
    id,
    title,
    value,
    defaultValue,
    placeholder,
    disabled,
    onChange,
  });
}

function FormCheckbox({
  id,
  label,
  value,
  defaultValue,
  disabled,
  onChange,
}: FormCheckboxProps): ReactElement {
  return createElement("FormCheckbox", {
    id,
    label,
    value,
    defaultValue,
    disabled,
    onChange,
  });
}

function FormDropdown({
  id,
  title,
  value,
  defaultValue,
  placeholder,
  disabled,
  children,
  onChange,
}: FormDropdownProps): ReactElement {
  return createElement(
    "FormDropdown",
    {
      id,
      title,
      value,
      defaultValue,
      placeholder,
      disabled,
      onChange,
    },
    children,
  );
}

function FormDropdownItem({
  value,
  title,
  icon,
}: FormDropdownItemProps): ReactElement {
  return createElement("FormDropdownItem", { value, title, icon });
}

function FormSeparator(_props: FormSeparatorProps): ReactElement {
  return createElement("FormSeparator");
}

const FormDropdownComponent: FormDropdownComponent = Object.assign(
  FormDropdown,
  {
    Item: FormDropdownItem,
  },
);

export const Form: FormComponent = Object.assign(FormRoot, {
  TextField: FormTextField,
  PasswordField: FormPasswordField,
  TextArea: FormTextArea,
  Checkbox: FormCheckbox,
  Dropdown: FormDropdownComponent,
  Separator: FormSeparator,
});
