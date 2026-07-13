<?php

namespace Limas\Controller\Actions;

use ApiPlatform\Doctrine\Orm\State\ItemProvider;
use Doctrine\ORM\EntityManagerInterface;
use League\Flysystem\UnableToReadFile;
use Limas\Entity\UploadedFile;
use Limas\Service\MimetypeIconService;
use Limas\Service\UploadedFileService;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;


class FileActions
	extends AbstractController
{
	use ActionUtilTrait;


	public function __construct(
		protected readonly EntityManagerInterface $entityManager,
		protected readonly UploadedFileService    $uploadedFileService,
		protected readonly MimetypeIconService    $mimetypeIconService,
		protected readonly LoggerInterface        $logger,
		protected readonly ItemProvider           $dataProvider,
		protected readonly array                  $limas
	)
	{
	}

	public function getMimeTypeIconAction(Request $request, int $id): Response
	{
		$entity = $this->getItem($this->dataProvider, $this->getEntityClass($request), $id);
		// URL-only attachments have no Blob yet → no mimetype; fall back to
		// the generic octet-stream icon so the FE always has something to
		// render. Caller can still surface the sourceUrls in the UI.
		$mime = $entity->getMimetype() ?? 'application/octet-stream';
		return new BinaryFileResponse(
			$this->mimetypeIconService->getMimetypeIcon($mime),
			Response::HTTP_OK,
			[],
			false,
			null,
			true,
			true
		);
	}

	public function getFileAction(Request $request, int $id): Response
	{
		$file = $this->getItem($this->dataProvider, $this->getEntityClass($request), $id);
		$filename = $file->getFilename();
		if ($filename === null) {
			// URL-only attachment with no Blob yet — nothing to stream
			return new Response('404 No blob attached (URL-only)', Response::HTTP_NOT_FOUND);
		}
		try {
			$mimetype = $file->getMimetype() ?? 'application/octet-stream';
			// Only an allowlist of types is safe to render inline: they cannot
			// carry script that executes on our origin. Everything else — most
			// dangerously text/html, image/svg+xml, *xml — is forced to
			// download, so a stored attachment can never become same-origin
			// stored-XSS when opened (the frontend loads getFile in an
			// iframe). nosniff stops the browser re-interpreting bytes as a
			// richer, script-capable type regardless of the declared one.
			$inlineSafe = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
			$isInline = in_array(strtolower(trim(explode(';', $mimetype)[0])), $inlineSafe, true);

			$displayName = basename($file->getOriginalFilename() ?? $filename);
			$asciiFallback = preg_replace('#[^\x20-\x7e]#', '_', $displayName);
			if ($asciiFallback === null || $asciiFallback === '') {
				$asciiFallback = 'download';
			}
			$response = new Response(
				$this->uploadedFileService->getStorage($file)->read($filename),
				Response::HTTP_OK,
				[
					'Content-Type' => $isInline ? $mimetype : 'application/octet-stream',
					'X-Content-Type-Options' => 'nosniff'
				]
			);
			$response->headers->set('Content-Disposition', $response->headers->makeDisposition(
				$isInline ? ResponseHeaderBag::DISPOSITION_INLINE : ResponseHeaderBag::DISPOSITION_ATTACHMENT,
				$displayName,
				$asciiFallback
			));
			return $response;
		} catch (UnableToReadFile $e) {
			$this->logger->error(sprintf('File %s not found in blob storage (%s)', $filename, $file->getType()));
			return new Response('404 File not found', Response::HTTP_NOT_FOUND);
		}
	}

	public function deleteFileAction(Request $request, int $id): object
	{
		try {
			/** @var UploadedFile $file */
			$file = $this->getItem($this->dataProvider, $this->getEntityClass($request), $id);
			// Route through the service so Blob refcount is honoured —
			// the underlying file only gets removed when the last attachment referencing it is gone
			$this->uploadedFileService->delete($file);
			return $file;
		} catch (\Throwable $e) {
			$this->logger->error('deleteFileAction failed: ' . $e->getMessage(), ['exception' => $e]);
			return new Response('', Response::HTTP_INTERNAL_SERVER_ERROR);
		}
	}

	protected function getEntityClass(Request $request): string
	{
		return $request->attributes->get('_api_resource_class');
	}
}
