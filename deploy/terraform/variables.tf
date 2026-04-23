variable "project_id" {
  description = "El ID del proyecto de GCP para Gamma Ingenieros"
  type        = string
}

variable "region" {
  description = "Región donde se alojarán los recursos (ej. us-central1)"
  type        = string
  default     = "us-central1"
}

variable "db_password" {
  description = "Contraseña de la base de datos SQL Privada."
  type        = string
  sensitive   = true
}
