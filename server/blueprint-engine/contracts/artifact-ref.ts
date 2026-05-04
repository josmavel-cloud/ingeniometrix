export type ArtifactStorageKind = "local_file" | "object_storage" | "db_blob" | "external_url";

export type ArtifactRef = {
  ref_id: string;
  uri: string;
  storage_kind: ArtifactStorageKind;
  content_type: string;
  byte_size?: number | null;
  sha256?: string | null;
};

