import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../utils/base_utils/entities/baseEntity";

/**
 * Named permission template. Copied onto user_permissions at user create;
 * later user ACL edits are independent (template is not live-bound).
 */
@Entity("permission_roles")
export class PermissionRole extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 120 })
  name: string;

  @Column({ type: "text", nullable: true, default: null })
  description: string | null;

  /** Same nested jsonb shape as user_permissions.permissions */
  @Column({
    type: "jsonb",
    nullable: false,
    default: {},
  })
  permissions: Record<string, any>;

  @Column({ type: "boolean", default: true })
  is_active: boolean;
}
