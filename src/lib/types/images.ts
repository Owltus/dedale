// Types images — système d'images partagé

export interface Image {
  id_image: number;
  nom: string;
  description: string | null;
  image_data_base64: string;
  image_mime: string;
  taille_octets: number;
  date_creation: string | null;
}

export interface ImageLibraryItem extends Image {
  usages: string;
}

export interface ImageInput {
  nom: string;
  description: string | null;
  image_data_base64: string;
  image_mime: string;
}
